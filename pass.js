const bcrypt = require("bcryptjs");

async function hashPassword() {
  const password = process.env.ADMIN_PASS; // your admin password
  const hashed = await bcrypt.hash(password, 10);
  console.log(hashed);
}

hashPassword();
