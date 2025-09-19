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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
let AuthService = class AuthService {
    constructor(prisma, jwt) {
        this.prisma = prisma;
        this.jwt = jwt;
    }
    isEmail(x) { return /\S+@\S+\.\S+/.test(x); }
    nameOf(u) {
        return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ');
    }
    async exists(login, verbose = false) {
        if (!login?.trim())
            throw new common_1.BadRequestException('login is required');
        const where = this.isEmail(login)
            ? { email: login.toLowerCase() }
            : { phone: login.replace(/\s+/g, '') };
        const user = await this.prisma.user.findFirst({
            where,
            select: { userId: true, firstName: true, middleName: true, lastName: true, userStatus: true }
        });
        if (!user)
            return { ok: true, exists: false };
        return verbose
            ? { ok: true, exists: true, user: { name: this.nameOf(user), status: user.userStatus } }
            : { ok: true, exists: true };
    }
    async verifyOtp(login, code) {
        if (!login?.trim() || !code?.trim())
            throw new common_1.BadRequestException('login and code are required');
        // DEV OTP
        if (code !== '000000')
            return { ok: false, error: 'Invalid OTP' };
        const where = this.isEmail(login)
            ? { email: login.toLowerCase() }
            : { phone: login.replace(/\s+/g, '') };
        const user = await this.prisma.user.findFirst({
            where,
            select: {
                userId: true, email: true, phone: true, firstName: true, middleName: true, lastName: true,
                userStatus: true, isSuperAdmin: true
            }
        });
        if (!user)
            return { ok: false, error: 'User not found' };
        const token = await this.jwt.signAsync({
            sub: user.userId,
            email: user.email,
            isSuperAdmin: user.isSuperAdmin
        }, { expiresIn: '12h' });
        return {
            ok: true,
            token,
            user: {
                id: user.userId,
                name: this.nameOf(user),
                email: user.email,
                phone: user.phone,
                status: user.userStatus,
                isSuperAdmin: user.isSuperAdmin
            }
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof prisma_service_1.PrismaService !== "undefined" && prisma_service_1.PrismaService) === "function" ? _a : Object, jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map