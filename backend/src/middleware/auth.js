const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function authRequired(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Not authenticated' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
    next();
  };
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role, name: user.full_name },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

module.exports = { authRequired, requireRole, signToken, JWT_SECRET };
