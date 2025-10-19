const express = require("express");
const router = express.Router();
const pool = require("../db"); // promise pool
const bcrypt = require("bcryptjs");
const { ensureAuthenticated, ensureAdmin } = require("../middleware"); // you need to implement these

// ------------------- USER DASHBOARD -------------------

// Home page for logged-in users
router.get("/home", ensureAuthenticated, (req, res) => {
  res.render("./pages/user/index", { user: req.session.user });
});

// Book courier form
router.get("/home/bookCourier", ensureAuthenticated, (req, res) => {
  res.render("./pages/user/bookCourier", { user: req.session.user });
});

// Generate tracking number
function generateTrackingNo() {
  return "CMS" + Math.random().toString(36).substr(2, 8).toUpperCase();
}

// POST route: Book courier
router.post("/home/bookCourier", ensureAuthenticated, async (req, res) => {
  const { receiverName, receiverPhone, address, weight, paymentMode } = req.body;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const senderId = req.session.user.user_id;
    const trackingNo = generateTrackingNo();

    // Insert into couriers
    const [courierResult] = await conn.query(
      `INSERT INTO couriers 
      (tracking_no, sender_id, receiver_id, receiver_name, receiver_phone, delivery_address, weight, status, booking_date)
      VALUES (?, ?, NULL, ?, ?, ?, ?, 'Booked', NOW())`,
      [trackingNo, senderId, receiverName, receiverPhone, address, weight]
    );

    const courierId = courierResult.insertId;
    const amount = parseFloat(weight) * 10; // example rate per kg

    // Insert into payments
    // Insert into payments
let paymentStatus = "Pending";
if (paymentMode.toLowerCase() !== "cash on delivery") {
  paymentStatus = "Paid"; // Automatically mark paid
}

await conn.query(
  `INSERT INTO payments (courier_id, amount, payment_mode, payment_status) 
   VALUES (?, ?, ?, ?)`,
  [courierId, amount, paymentMode, paymentStatus]
);

    // Insert into receipts
    await conn.query(
      `INSERT INTO receipts (courier_id, issued_date, remarks) 
       VALUES (?, NOW(), ?)`,
      [courierId, `Courier booked - ${trackingNo}`]
    );

    // Insert into tracking
    await conn.query(
      `INSERT INTO tracking (courier_id, status, location, updated_at)
       VALUES (?, 'Booked', 'Origin', NOW())`,
      [courierId]
    );

    await conn.commit();
    conn.release();

    res.render("./pages/user/bookingSuccess", {
      trackingNo,
      message: "Courier booked successfully!",
      user: req.session.user
    });
  } catch (err) {
    await conn.rollback();
    conn.release();
    console.error(err);
    res.status(500).send("Error booking courier");
  }
});

// Track courier - GET form
router.get("/home/trackCourier", ensureAuthenticated, (req, res) => {
  res.render("./pages/user/trackCourier", {
    courier: null,
    payment: null,
    tracking: [],
    notFound: false,
    user: req.session.user
  });
});

// Track courier - POST
router.post("/home/trackCourier", ensureAuthenticated, async (req, res) => {
  const { trackingNo } = req.body;

  try {
    const [couriers] = await pool.query(
      `SELECT * FROM couriers WHERE tracking_no = ?`,
      [trackingNo]
    );

    if (couriers.length === 0) {
      return res.render("./pages/user/trackCourier", {
        courier: null,
        payment: null,
        tracking: [],
        notFound: true,
        user: req.session.user
      });
    }

    const courier = couriers[0];

    const [payments] = await pool.query(
      `SELECT * FROM payments WHERE courier_id = ?`,
      [courier.courier_id]
    );

    const payment = payments.length > 0 ? payments[0] : null;

    const [tracking] = await pool.query(
      `SELECT * FROM tracking WHERE courier_id = ? ORDER BY updated_at ASC`,
      [courier.courier_id]
    );

    res.render("./pages/user/trackCourier", {
      courier,
      payment,
      tracking,
      notFound: false,
      user: req.session.user
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching courier details.");
  }
});

// My Bookings
router.get("/home/myBookings", ensureAuthenticated, async (req, res) => {
  const senderId = req.session.user.user_id;

  try {
    const [couriers] = await pool.query(
      `SELECT c.courier_id, c.tracking_no, c.receiver_name, c.receiver_phone, c.delivery_address, c.weight, c.status, 
              p.amount, p.payment_status, c.booking_date, c.delivery_date
       FROM couriers c
       LEFT JOIN payments p ON c.courier_id = p.courier_id
       WHERE c.sender_id = ?
       ORDER BY c.booking_date DESC`,
      [senderId]
    );

    res.render("./pages/user/myBookings", { couriers, user: req.session.user });

  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching bookings.");
  }
});

// ------------------- REGISTER & LOGIN -------------------

// Register page
router.get("/home/register", (req, res) => {
  res.render("./pages/user/register", { error: null, success: null });
});

// Register POST
router.post("/home/register", async (req, res) => {
  const { name, email, password, phone, role } = req.body; // role optional

  try {
    const [existing] = await pool.query(`SELECT * FROM users WHERE email = ?`, [email]);
    if (existing.length > 0) {
      return res.render("./pages/user/register", { error: "Email already registered!", success: null });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      `INSERT INTO users (name, email, password, role, phone, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [name, email, hashedPassword, role || "customer", phone]
    );

    res.render("./pages/user/register", { error: null, success: "Registration successful! You can now login." });

  } catch (err) {
    console.error(err);
    res.render("./pages/user/register", { error: "Error registering user.", success: null });
  }
});

// Login page
router.get("/login", (req, res) => {
  res.render("./pages/user/login", { error: null });
});

// Login POST
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) return res.render("./pages/user/login", { error: "Invalid email or password" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render("./pages/user/login", { error: "Invalid email or password" });

    req.session.user = {
      user_id: user.user_id,
      name: user.name,
      role: user.role
    };

    if (user.role === "admin") res.redirect("/admin");
    else res.redirect("/home");

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// Logout
router.get("/logout", (req, res) => {
  req.session.destroy(err => {
    if (err) console.error(err);
    res.redirect("/login");
  });
});

// ------------------- ADMIN -------------------
router.get("/admin", ensureAdmin, async (req, res) => {
  try {
    // 1️⃣ Total earnings (only Paid payments)
    const [totalResult] = await pool.query(
      `SELECT SUM(amount) AS totalEarnings FROM payments WHERE payment_status = 'Paid'`
    );
    const totalEarnings = parseFloat(totalResult[0].totalEarnings) || 0;

    // 2️⃣ Monthly earnings
    const [monthlyResults] = await pool.query(
      `SELECT MONTH(booking_date) AS month, SUM(p.amount) AS monthlyEarnings
       FROM couriers c
       JOIN payments p ON c.courier_id = p.courier_id
       WHERE p.payment_status = 'Paid'
       GROUP BY MONTH(booking_date)
       ORDER BY MONTH(booking_date)`
    );

    // Parse monthly earnings to numbers
    monthlyResults.forEach(m => {
      m.monthlyEarnings = parseFloat(m.monthlyEarnings) || 0;
    });

    // 3️⃣ Total bookings
    const [bookingResults] = await pool.query(
      `SELECT COUNT(*) AS totalBookings FROM couriers`
    );
    const totalBookings = parseInt(bookingResults[0].totalBookings) || 0;

    // Render admin dashboard
    res.render("./pages/admin/index", {
      user: req.session.user,
      totalEarnings,
      monthlyResults,
      totalBookings
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});


// Admin: view all bookings
router.get("/admin/bookings", ensureAdmin, async (req, res) => {
  try {
    const [bookings] = await pool.query(`
      SELECT c.courier_id, c.tracking_no, c.sender_id, u.name AS sender_name,
             c.receiver_name, c.receiver_phone, c.delivery_address, c.weight,
             c.status as delivery_status, p.payment_status, p.payment_mode,
             p.amount, c.booking_date, c.delivery_date
      FROM couriers c
      LEFT JOIN payments p ON c.courier_id = p.courier_id
      LEFT JOIN users u ON c.sender_id = u.user_id
      ORDER BY c.booking_date DESC
    `);

    res.render("./pages/admin/bookings", { bookings });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching bookings");
  }
});

// Admin: update delivery/payment status and delivery date
router.post("/admin/bookings/update/:courierId", ensureAdmin, async (req, res) => {
  const { courierId } = req.params;
  const { deliveryStatus, paymentStatus, deliveryDate } = req.body;

  try {
    // Update delivery status and delivery date
    await pool.query(
      `UPDATE couriers 
       SET status = ?, delivery_date = ? 
       WHERE courier_id = ?`,
      [deliveryStatus, deliveryDate || null, courierId]
    );

    // Update payment status
    await pool.query(
      `UPDATE payments 
       SET payment_status = ? 
       WHERE courier_id = ?`,
      [paymentStatus, courierId]
    );

    res.redirect("/admin/bookings");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error updating booking");
  }
});
router.get("/admin/users", ensureAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT user_id, name, email, role, phone, created_at 
      FROM users
      ORDER BY created_at DESC
    `);

    res.render("./pages/admin/users", { users });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching users");
  }
});

module.exports = router;
