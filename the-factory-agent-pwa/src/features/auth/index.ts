/**
 * Auth feature — public API.
 * Never import from feature internals — use this barrel export only.
 */
export { useAuthNavigation } from './navigation';
export { AuthProvider, AuthContext, resolveManagerRole } from './context/AuthContext';
export type { AuthUser, AuthContextType } from './context/AuthContext';
export { useAuth } from './hooks/useAuth';
export { useAgentIdentity } from './hooks/useAgentIdentity';
export { useManagerIdentity } from './hooks/useManagerIdentity';
export type { ManagerIdentity } from './hooks/useManagerIdentity';
export { useManagerPermissions } from './hooks/useManagerPermissions';
export type { ManagerPermissions } from './hooks/useManagerPermissions';
export {
  useLoginMutation,
  useForgotPasswordMutation,
  useValidateResetTokenQuery,
  useResetPasswordMutation,
  useLogoutMutation,
  useProfile,
  useCompanySettings,
  useUpdateCompanySettingsMutation,
} from './queries';
export type {
  LoginPayload,
  LoginResponse,
  ForgotPasswordPayload,
  ForgotPasswordResponse,
  ResetPasswordPayload,
  ResetPasswordResponse,
  Profile,
} from './types';
export { authApi } from './api';
export type { CompanySettingsData } from './api';
export {
  loginPayloadSchema,
  loginResponseSchema,
  forgotPasswordPayloadSchema,
  resetPasswordPayloadSchema,
} from './schema';
