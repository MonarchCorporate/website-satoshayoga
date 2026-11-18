import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import AppLayout from "@/components/layout/AppLayout";
import BackofficeLayout from "@/components/layout/BackofficeLayout";
import ProtectedRoute from "@/components/ProtectedRoute";

import Index from "@/pages/Index";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Schedule from "@/pages/Schedule";
import Shop from "@/pages/Shop";
import Cart from "@/pages/Cart";
import Checkout from "@/pages/Checkout";
import CheckoutReturn from "@/pages/CheckoutReturn";
import CheckoutCancel from "@/pages/CheckoutCancel";
import Dashboard from "@/pages/Dashboard";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminCourses from "@/pages/admin/AdminCourses";
import AdminBookings from "@/pages/admin/AdminBookings";
import AdminCustomers from "@/pages/admin/AdminCustomers";
import AdminCards from "@/pages/admin/AdminCards";
import AdminEmails from "@/pages/admin/AdminEmails";
import AdminTrainers from "@/pages/admin/AdminTrainers";
import AdminCourseTypes from "@/pages/admin/AdminCourseTypes";
import AdminSettings from "@/pages/admin/AdminSettings";
import AdminProducts from "@/pages/admin/AdminProducts";
import AdminVouchers from "@/pages/admin/AdminVouchers";
import AdminVideoCourses from "@/pages/admin/AdminVideoCourses";
import AdminVideoCourseEditor from "@/pages/admin/AdminVideoCourseEditor";
import AdminVideoCourseLessons from "@/pages/admin/AdminVideoCourseLessons";
import VideoCoursesPage from "@/pages/VideoCourses";
import VideoCourseDetail from "@/pages/VideoCourseDetail";
import VideoCourseReturn from "@/pages/VideoCourseReturn";
import MyVideoCourses from "@/pages/MyVideoCourses";
import VideoCoursePlayer from "@/pages/VideoCoursePlayer";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminInvoicePreview from "@/pages/admin/AdminInvoicePreview";
import MyCourses from "@/pages/admin/MyCourses";
import MyProfile from "@/pages/admin/MyProfile";
import TrainerWelcome from "@/pages/admin/TrainerWelcome";
import MyEarnings from "@/pages/admin/MyEarnings";
import AdminTrainerPayouts from "@/pages/admin/AdminTrainerPayouts";
import AdminTrainerCompensation from "@/pages/admin/AdminTrainerCompensation";
import AdminNewsletterCampaigns from "@/pages/admin/AdminNewsletterCampaigns";
import AdminNewsletterCampaignEditor from "@/pages/admin/AdminNewsletterCampaignEditor";
import AdminNewsletterCampaignStats from "@/pages/admin/AdminNewsletterCampaignStats";
import AdminNewsletterSettings from "@/pages/admin/AdminNewsletterSettings";
import NewsletterUnsubscribe from "@/pages/NewsletterUnsubscribe";
import Impressum from "@/pages/Impressum";
import Datenschutz from "@/pages/Datenschutz";
import AGB from "@/pages/AGB";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public + customer area with main app layout */}
            <Route element={<AppLayout />}>
              <Route path="/" element={<Index />} />
              <Route path="/portal" element={<Auth />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/shop" element={<Shop />} />
              <Route path="/cart" element={<ProtectedRoute><Cart /></ProtectedRoute>} />
              <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
              <Route path="/checkout/return" element={<CheckoutReturn />} />
              <Route path="/checkout/cancel" element={<CheckoutCancel />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/online-kurse" element={<VideoCoursesPage />} />
              <Route path="/online-kurse/:slug" element={<VideoCourseDetail />} />
              <Route path="/online-kurse/:slug/return" element={<ProtectedRoute><VideoCourseReturn /></ProtectedRoute>} />
              <Route path="/meine-online-kurse" element={<ProtectedRoute><MyVideoCourses /></ProtectedRoute>} />
              <Route path="/meine-online-kurse/:slug" element={<ProtectedRoute><VideoCoursePlayer /></ProtectedRoute>} />
              <Route path="/newsletter/unsubscribe" element={<NewsletterUnsubscribe />} />
              <Route path="/impressum" element={<Impressum />} />
              <Route path="/datenschutz" element={<Datenschutz />} />
              <Route path="/agb" element={<AGB />} />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Backoffice CRM with sidebar layout */}
            <Route
              element={
                <ProtectedRoute requireBackoffice>
                  <BackofficeLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/my-courses" element={<MyCourses />} />
              <Route path="/admin/my-profile" element={<MyProfile />} />
              <Route path="/admin/welcome" element={<TrainerWelcome />} />
              <Route path="/admin/bookings" element={<AdminBookings />} />
              <Route path="/admin/my-earnings" element={<MyEarnings />} />
              <Route
                path="/admin/trainer-payouts"
                element={<ProtectedRoute requireAdmin><AdminTrainerPayouts /></ProtectedRoute>}
              />
              <Route
                path="/admin/trainers/:id/compensation"
                element={<ProtectedRoute requireAdmin><AdminTrainerCompensation /></ProtectedRoute>}
              />
              <Route
                path="/admin/courses"
                element={<ProtectedRoute requireAdmin><AdminCourses /></ProtectedRoute>}
              />
              <Route
                path="/admin/customers"
                element={<ProtectedRoute requireAdmin><AdminCustomers /></ProtectedRoute>}
              />
              <Route
                path="/admin/cards"
                element={<ProtectedRoute requireAdmin><AdminCards /></ProtectedRoute>}
              />
              <Route
                path="/admin/emails"
                element={<ProtectedRoute requireAdmin><AdminEmails /></ProtectedRoute>}
              />
              <Route
                path="/admin/trainers"
                element={<ProtectedRoute requireAdmin><AdminTrainers /></ProtectedRoute>}
              />
              <Route
                path="/admin/course-types"
                element={<ProtectedRoute requireAdmin><AdminCourseTypes /></ProtectedRoute>}
              />
              <Route
                path="/admin/settings"
                element={<ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>}
              />
              <Route
                path="/admin/products"
                element={<ProtectedRoute requireAdmin><AdminProducts /></ProtectedRoute>}
              />
              <Route
                path="/admin/orders"
                element={<ProtectedRoute requireAdmin><AdminOrders /></ProtectedRoute>}
              />
              <Route
                path="/admin/orders/invoice-preview"
                element={<ProtectedRoute requireAdmin><AdminInvoicePreview /></ProtectedRoute>}
              />
              <Route
                path="/admin/vouchers"
                element={<ProtectedRoute requireAdmin><AdminVouchers /></ProtectedRoute>}
              />
              <Route
                path="/admin/video-courses"
                element={<ProtectedRoute requireAdmin><AdminVideoCourses /></ProtectedRoute>}
              />
              <Route
                path="/admin/video-courses/new"
                element={<ProtectedRoute requireAdmin><AdminVideoCourseEditor /></ProtectedRoute>}
              />
              <Route
                path="/admin/video-courses/:id"
                element={<ProtectedRoute requireAdmin><AdminVideoCourseEditor /></ProtectedRoute>}
              />
              <Route
                path="/admin/video-courses/:id/lessons"
                element={<ProtectedRoute requireAdmin><AdminVideoCourseLessons /></ProtectedRoute>}
              />
              <Route
                path="/admin/newsletter"
                element={<ProtectedRoute requireAdmin><AdminNewsletterCampaigns /></ProtectedRoute>}
              />
              <Route
                path="/admin/newsletter/settings"
                element={<ProtectedRoute requireAdmin><AdminNewsletterSettings /></ProtectedRoute>}
              />
              <Route
                path="/admin/newsletter/campaigns/:id"
                element={<ProtectedRoute requireAdmin><AdminNewsletterCampaignEditor /></ProtectedRoute>}
              />
              <Route
                path="/admin/newsletter/campaigns/:id/stats"
                element={<ProtectedRoute requireAdmin><AdminNewsletterCampaignStats /></ProtectedRoute>}
              />
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
