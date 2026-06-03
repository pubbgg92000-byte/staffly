/**
 * @staffly/ui — shared design system.
 *
 * Components export from a single barrel for convenience. Apps that care
 * about tree-shaking can import directly from subpaths if needed; Next 15
 * tree-shakes barrels reliably.
 */
export const STAFFLY_UI_VERSION = "0.10.0";

// Utilities
export { cn } from "./lib/cn";

// API + session
export { api, type Api, type ApiFetchOptions } from "./api/client";
export { ApiError, isApiError } from "./api/error";
export {
  useSession,
  useSignIn,
  useSignOut,
  useVerifyTwoFactor,
  useForgotPassword,
  useResetPassword,
  useInvitePeek,
  useAcceptInvite,
  sessionKeys,
} from "./api/session";
export {
  useAdminDashboard,
  useEmployeeDashboard,
  useCheckIn,
  useCheckOut,
  dashboardKeys,
} from "./api/dashboard";

// Providers
export { QueryProvider } from "./providers/query-provider";
export { ThemeProvider } from "./providers/theme-provider";
export { Toaster, toast } from "./providers/toast-provider";

// Primitives
export {
  Button,
  buttonVariants,
  type ButtonProps,
} from "./components/ui/button";
export { Input, type InputProps } from "./components/ui/input";
export { Label } from "./components/ui/label";
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./components/ui/card";
export { Skeleton } from "./components/ui/skeleton";
export { Alert, AlertTitle, AlertDescription } from "./components/ui/alert";
export { Badge, badgeVariants, type BadgeProps } from "./components/ui/badge";
export { Avatar, AvatarImage, AvatarFallback } from "./components/ui/avatar";
export { Separator } from "./components/ui/separator";
export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuPortal,
} from "./components/ui/dropdown-menu";
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "./components/ui/tooltip";
export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetClose,
  SheetPortal,
} from "./components/ui/sheet";

// Composites
export { Brand } from "./components/brand";
export { PageHeader } from "./components/page-header";
export { StatusBadge, type StatusTone } from "./components/status-badge";
export { StatCard } from "./components/stat-card";
export { WidgetCard } from "./components/widget-card";
export { EmptyState } from "./components/empty-state";
export { PasswordInput } from "./components/password-input";
export { PasswordStrengthMeter } from "./components/password-strength-meter";
export { OtpInput, type OtpInputProps } from "./components/otp-input";

// Auth forms (page-level, shared across portals)
export { SignInForm } from "./auth-forms/sign-in-form";
export { ForgotPasswordForm } from "./auth-forms/forgot-password-form";
export { ResetPasswordForm } from "./auth-forms/reset-password-form";
export { TwoFactorForm } from "./auth-forms/two-factor-form";
export { AcceptInviteForm } from "./auth-forms/accept-invite-form";
export { resolveRedirect } from "./auth-forms/role-redirect";

// Layouts
export { AuthLayout } from "./layouts/auth-layout";
export { AdminLayout } from "./layouts/admin-layout";
export { EmployeeLayout } from "./layouts/employee-layout";
export { Sidebar, SidebarMobileNav } from "./layouts/sidebar";
export { Topbar } from "./layouts/topbar";
export { BottomTabNav } from "./layouts/bottom-tab-nav";
export { UserMenu } from "./layouts/user-menu";
export type { NavItem } from "./layouts/types";
