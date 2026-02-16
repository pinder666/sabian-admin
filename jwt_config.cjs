const fs = require('fs');
const path = require('path');

const privateKey = fs.readFileSync(path.join(__dirname, 'keys', 'private_key.pem'), 'utf8');
const publicKey = fs.readFileSync(path.join(__dirname, 'keys', 'public_key.pem'), 'utf8');

module.exports = {
    privateKey,
    publicKey,
    jwtOptions: {
        algorithm: 'RS256',
        expiresIn: '1h',
    }
};
