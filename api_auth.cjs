const jwt = require('jsonwebtoken');
const { publicKey, jwtOptions } = require('./jwt_config.cjs');

module.exports = function apiAuth(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return res.status(401).send('Missing Authorization header');
    }

    const token = authHeader.split(' ')[1]; // Remove "Bearer "

    jwt.verify(token, publicKey, jwtOptions, (err, decoded) => {
        if (err) {
            return res.status(403).send('Invalid or expired token');
        }
        
        req.user = decoded; // optional: attach decoded payload to request
        next();
    });
};
