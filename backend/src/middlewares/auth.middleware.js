const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const authMiddleware = [
  (req, res, next) => {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const token = header.replace('Bearer ', '');
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = payload;
      return next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
];

module.exports = authMiddleware;
