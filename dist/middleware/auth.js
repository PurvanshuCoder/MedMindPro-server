"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
    if (!token)
        return res.status(401).json({ message: 'Missing token' });
    try {
        const JWT_SECRET = process.env.JWT_SECRET ?? '';
        if (!JWT_SECRET)
            return res.status(500).json({ message: 'Server auth not configured' });
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (typeof decoded !== 'object' || decoded === null) {
            return res.status(401).json({ message: 'Invalid token payload' });
        }
        const userId = decoded.sub;
        if (!userId)
            return res.status(401).json({ message: 'Invalid token subject' });
        req.user = { id: userId };
        next();
    }
    catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}
