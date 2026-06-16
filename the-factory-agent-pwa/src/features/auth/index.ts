/**
 * Auth feature — public API.
 * Never import from feature internals — use this barrel export only.
 */
export { useAuthNavigation } from './navigation';
export { AuthProvider, AuthContext } from './context/AuthContext';
export type { AuthUser } from './context/AuthContext';
export { useAuth } from './hooks/useAuth';
export {
  useLoginMutation,
  useForgotPasswordMutation,
  useValidateResetTokenQuery,
  useResetPasswordMutation,
  useLogoutMutation,
  useProfile,
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
export {
  loginPayloadSchema,
  loginResponseSchema,
  forgotPasswordPayloadSchema,
  resetPasswordPayloadSchema,
} from './schema';
