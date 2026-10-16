const crypto = require('node:crypto');
function authorizeCron(header, secret) {
  if (!header || !secret || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7)); const expected = Buffer.from(secret);
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
module.exports = { authorizeCron };
