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
// pms-backend/src/modules/auth/auth.controller.ts
const common_1 = require("@nestjs/common");
const auth_service_1 = require("./auth.service");
const jwt_guard_1 = require("../../common/guards/jwt.guard");
const assume_role_dto_1 = require("./dto/assume-role.dto");
function nameOf(u) {
    return [u?.firstName, u?.middleName, u?.lastName].filter(Boolean).join(' ').trim() || 'User';
}
let AuthController = class AuthController {
    constructor(auth) {
        this.auth = auth;
    }
    async exists(req) {
        const login = req.query?.login ?? '';
        const verbose = req.query?.verbose;
        return this.auth.exists(login, verbose === '1');
    }
    // No guard here; OTP is the proof
    async verifyOtp(dto) {
        const { user, memberships } = await this.auth.verifyOtp(dto.login, dto.code);
        // 0 or 1 role → issue final token immediately
        if (!memberships || memberships.length <= 1) {
            const payload = {
                sub: user.userId,
                isSuperAdmin: !!user.isSuperAdmin,
            };
            if (memberships?.length === 1) {
                payload.role = memberships[0].role;
            }
            const token = await this.auth.signJwt(payload, { expiresIn: '2h' });
            return {
                ok: true,
                user: {
                    userId: user.userId,
                    name: nameOf(user), // ✅ build name
                    email: user.email,
                    phone: user.phone,
                    countryCode: user.countryCode,
                    status: user.userStatus,
                    isSuperAdmin: !!user.isSuperAdmin,
                },
                token,
                jwt: payload,
                chooseRole: false,
                roles: [],
            };
        }
        // Multiple roles → short-lived bootstrap token
        const provisional = await this.auth.signJwt({ sub: user.userId, provisional: true }, { expiresIn: '10m' });
        const roles = memberships.map((m) => ({
            id: m.id,
            role: m.role,
            scopeType: m.scopeType,
            scopeId: m.companyId ?? m.projectId ?? null,
            label: this.auth.describeMembership(m),
            company: m.companyId
                ? { id: m.companyId, name: m.company?.name, role: m.company?.companyRole }
                : undefined,
            project: m.projectId
                ? { id: m.projectId, title: m.project?.title, code: m.project?.code }
                : undefined,
        }));
        return {
            ok: true,
            user: {
                userId: user.userId,
                name: nameOf(user), // ✅ build name
                email: user.email,
                phone: user.phone,
                countryCode: user.countryCode,
                status: user.userStatus,
                isSuperAdmin: !!user.isSuperAdmin,
            },
            token: provisional, // ✅ FE uses this for /auth/assume-role
            chooseRole: true,
            roles,
        };
    }
    async assume(req, dto) {
        return this.auth.assumeRole(req.user.sub, dto.membershipId);
    }
    async me(req) {
        return { ok: true, me: req.user };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Get)('exists'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "exists", null);
__decorate([
    (0, common_1.Post)('otp/verify'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Post)('assume-role'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, assume_role_dto_1.AssumeRoleDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "assume", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Get)('me'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)('auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map