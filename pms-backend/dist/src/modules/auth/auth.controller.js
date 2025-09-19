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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const otp_dto_1 = require("./dto/otp.dto");
let AuthController = class AuthController {
    constructor(auth) {
        this.auth = auth;
    }
    // GET /auth/exists?login=...&verbose=1
    async exists(login, verbose) {
        if (!login || !login.trim()) {
            throw new common_1.BadRequestException('login required');
        }
        const user = await this.auth.findByLogin(login);
        const exists = !!user;
        if (!exists)
            return { ok: true, exists: false };
        // name + status for your Login.tsx
        const fullName = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User';
        const res = { ok: true, exists: true };
        if (verbose)
            res.user = { name: fullName, status: user.userStatus };
        return res;
    }
    // POST /auth/otp/verify { login, code }
    async otpVerify(dto) {
        const { login, code } = dto;
        // dev OTP check
        if (code !== '000000') {
            return { ok: false, error: 'Invalid OTP' };
        }
        const user = await this.auth.findByLogin(login);
        if (!user) {
            return { ok: false, error: 'User not found' };
        }
        // safety: block inactive
        if (user.userStatus === 'Inactive') {
            const name = [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User';
            return { ok: false, error: `${name} has been de-activated by Admin. Contact Admin for more information!` };
        }
        const { token, payload } = this.auth.issueToken(user);
        const uiUser = {
            userId: user.userId,
            name: [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ') || 'User',
            isSuperAdmin: !!user.isSuperAdmin,
            status: user.userStatus,
            email: user.email,
            phone: user.phone,
            countryCode: user.countryCode,
            userRole: user.userRole
        };
        return { ok: true, token, user: uiUser, jwt: payload };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('exists'),
    __param(0, (0, common_1.Query)('login')),
    __param(1, (0, common_1.Query)('verbose')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "exists", null);
__decorate([
    (0, common_1.Post)('otp/verify'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [otp_dto_1.VerifyOtpDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "otpVerify", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map