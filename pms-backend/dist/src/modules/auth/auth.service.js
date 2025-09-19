"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const prisma_service_1 = require("../../prisma/prisma.service");
let AuthService = class AuthService {
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
    }
    /**
     * Accepts email or phone in `login`.
     * - If contains '@' -> email.
     * - Else treat as phone: normalize digits, default cc to '+91' if 10 digits.
     *   If login includes a country code (e.g. +919000000001 / 919000000001), we split it.
     */
    async findByLogin(login) {
        const raw = (login || '').trim();
        if (raw.includes('@')) {
            const email = raw.toLowerCase();
            return this.prisma.user.findUnique({ where: { email } });
        }
        // phone path
        const digits = raw.replace(/[^\d+]/g, '');
        // cases:
        //  - "9000000001" => cc +91, phone 9000000001
        //  - "+919000000001" or "919000000001" => cc +91, phone 9000000001
        //  - "+1xxxxxxxxxx" etc.
        let cc = '+91';
        let phone = digits;
        if (digits.startsWith('+')) {
            // +<cc><number> — try India or generic split
            if (digits.startsWith('+91') && digits.length >= 13) {
                cc = '+91';
                phone = digits.slice(3);
            }
            else {
                // crude split: assume first 1–3 chars after + is country code
                // adjust to your real parsing needs
                cc = '+' + digits.slice(1, 3);
                phone = digits.slice(3);
            }
        }
        else if (digits.length > 10) {
            // like "919000000001" => assume 91 + 10
            if (digits.startsWith('91') && digits.length >= 12) {
                cc = '+91';
                phone = digits.slice(2);
            }
            else {
                // fallback: last 10 as number, rest as cc (simple heuristic)
                cc = '+' + digits.slice(0, digits.length - 10);
                phone = digits.slice(-10);
            }
        }
        else if (digits.length === 10) {
            cc = '+91';
            phone = digits;
        }
        return this.prisma.user.findUnique({
            where: { countryCode_phone: { countryCode: cc, phone } }, // <- matches your composite unique
        });
    }
    issueToken(user) {
        const payload = {
            sub: user.userId,
            isSuperAdmin: !!user.isSuperAdmin,
            name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User',
        };
        const token = this.jwt.sign(payload);
        return { token, payload };
    }
    // Optional: for /auth/me later
    async me(userId) {
        const user = await this.prisma.user.findUnique({ where: { userId } });
        if (!user)
            return { ok: false, error: 'Not found' };
        return { ok: true, user };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService, jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map