import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LoginPage } from '../pages/LoginPage.js';
import { ClubDashboard } from '../pages/ClubDashboard.js';
import { Navbar } from '../components/Navbar.js';
import { NotificationDrawer } from '../components/NotificationDrawer.js';
import { CheckoutModal } from '../components/CheckoutModal.js';
import { ReturnModal } from '../components/ReturnModal.js';
import { AuthProvider } from '../context/AuthContext.js';
import { ThemeProvider } from '../context/ThemeContext.js';
import { api } from '../services/api.js';
import { isAdmin, isUser, getDisplayRole } from '../utils/roleUtils.js';

describe('Milestone 5: Frontend UI & Interactive Workflows', () => {
  describe('LoginPage & Demo Credentials', () => {
    it('renders login form and fills demo credentials on button click', () => {
      render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      expect(screen.getByText('Shared Event Kit')).toBeInTheDocument();
      const emailInput = screen.getByPlaceholderText('e.g. coordinator@campus.edu') as HTMLInputElement;
      const passInput = screen.getByPlaceholderText('••••••••••••') as HTMLInputElement;

      // Click Coordinator demo button
      const coordDemoBtn = screen.getByText('Coordinator');
      fireEvent.click(coordDemoBtn);

      expect(emailInput.value).toBe('coordinator@campus.edu');
      expect(passInput.value).toBe('Coordinator123!');

      // Click Robotics demo button
      const roboticsDemoBtn = screen.getByText('Robotics Club');
      fireEvent.click(roboticsDemoBtn);

      expect(emailInput.value).toBe('robotics_lead@campus.edu');
      expect(passInput.value).toBe('ClubPass123!');
    });
  });

  describe('Navbar & Notifications', () => {
    it('displays unread notification badge and triggers drawer toggle', () => {
      const onOpenMock = vi.fn();

      render(
        <AuthProvider>
          <Navbar
            unreadCount={3}
            onOpenNotifications={onOpenMock}
            currentUser={{
              id: 'u1',
              email: 'coord@campus.edu',
              name: 'Coordinator',
              role: 'COORDINATOR',
            }}
          />
        </AuthProvider>
      );

      const notifBtn = screen.getByTitle('Notifications');
      expect(notifBtn).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();

      fireEvent.click(notifBtn);
      expect(onOpenMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('NotificationDrawer', () => {
    it('renders notification items and calls markRead when clicked', () => {
      const onCloseMock = vi.fn();
      const onMarkReadMock = vi.fn();

      const sampleNotifs = [
        {
          id: 'n1',
          title: 'Upcoming Booking At Risk',
          message: 'Equipment damaged from prior booking.',
          isRead: false,
          createdAt: new Date().toISOString(),
        },
        {
          id: 'n2',
          title: 'Kit Restored',
          message: 'All equipment verified.',
          isRead: true,
          createdAt: new Date().toISOString(),
        },
      ];

      render(
        <NotificationDrawer
          isOpen={true}
          onClose={onCloseMock}
          notifications={sampleNotifs}
          onMarkRead={onMarkReadMock}
        />
      );

      expect(screen.getByText('Notifications & Alerts')).toBeInTheDocument();
      expect(screen.getByText('Upcoming Booking At Risk')).toBeInTheDocument();
      expect(screen.getByText('Kit Restored')).toBeInTheDocument();

      const readBtn = screen.getByTitle('Mark as read');
      fireEvent.click(readBtn);
      expect(onMarkReadMock).toHaveBeenCalledWith('n1');
    });
  });

  describe('CheckoutModal Guards', () => {
    it('disables checkout authorization if any item is marked DAMAGED or MISSING', () => {
      const mockBooking = {
        id: 'b-1',
        kitId: 'k-1',
        clubId: 'c-1',
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        status: 'RESERVED' as const,
        riskReasons: '[]',
        club: { name: 'Robotics Club', code: 'ROBOTICS' },
      };

      const mockItems = [
        { id: 'i1', type: 'CAMERA' as const, serialNumber: 'CAM-01', state: 'AVAILABLE' as const },
        { id: 'i2', type: 'MIC' as const, serialNumber: 'MIC-01', state: 'AVAILABLE' as const },
        { id: 'i3', type: 'TRIPOD' as const, serialNumber: 'TRI-01', state: 'AVAILABLE' as const },
      ];

      render(
        <CheckoutModal
          booking={mockBooking}
          kitItems={mockItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      const confirmBtn = screen.getByRole('button', { name: /Authorize Checkout & Handover/i });
      // When all are USABLE, button is enabled
      expect(confirmBtn).not.toBeDisabled();

      // Change first item (Camera) to DAMAGED
      const selects = screen.getAllByRole('combobox');
      fireEvent.change(selects[0], { target: { value: 'DAMAGED' } });

      // Button should now be disabled to prevent incomplete/unusable handover
      expect(confirmBtn).toBeDisabled();
      expect(screen.getByText(/Handover guard will block checkout if any item is DAMAGED or MISSING/i)).toBeInTheDocument();
    });
  });

  describe('ReturnModal Item-by-Item Reconciliation', () => {
    it('allows toggling item presence and inspection results', () => {
      const mockBooking = {
        id: 'b-1',
        kitId: 'k-1',
        clubId: 'c-1',
        start: new Date().toISOString(),
        end: new Date().toISOString(),
        status: 'CHECKED_OUT' as const,
        riskReasons: '[]',
        club: { name: 'Robotics Club', code: 'ROBOTICS' },
      };

      const mockItems = [
        { id: 'i1', type: 'CAMERA' as const, serialNumber: 'CAM-01', state: 'CHECKED_OUT' as const },
        { id: 'i2', type: 'MIC' as const, serialNumber: 'MIC-01', state: 'CHECKED_OUT' as const },
        { id: 'i3', type: 'TRIPOD' as const, serialNumber: 'TRI-01', state: 'CHECKED_OUT' as const },
      ];

      render(
        <ReturnModal
          booking={mockBooking}
          kitItems={mockItems}
          onClose={vi.fn()}
          onSuccess={vi.fn()}
        />
      );

      expect(screen.getByText('Item-by-Item Return & Inspection')).toBeInTheDocument();

      // Uncheck presence on Tripod (partial return)
      const checkboxes = screen.getAllByRole('checkbox');
      fireEvent.click(checkboxes[2]); // uncheck tripod

      expect(screen.getByText('Item marked MISSING. Will trigger disruption.')).toBeInTheDocument();
      expect(screen.getByText(/Disruption Alert: Missing or damaged items will automatically mark the next scheduled booking AT_RISK/i)).toBeInTheDocument();
    });
  });

  describe('ClubDashboard Kit ID Flow Regression', () => {
    it('fetches shared kit on load and supplies real kitId to availability check and booking creation', async () => {
      vi.spyOn(api, 'getSharedKit').mockResolvedValue({
        kit: { id: 'c1234567-89ab-cdef-0123-456789abcdef', name: 'Campus Event Kit', items: [] },
        isReadyForHandover: true,
        openDisruptions: [],
      });
      vi.spyOn(api, 'listBookings').mockResolvedValue([]);
      const checkAvailSpy = vi.spyOn(api, 'checkAvailability').mockResolvedValue({
        available: true,
        conflictingBookings: [],
      });
      const createBookingSpy = vi.spyOn(api, 'createBooking').mockResolvedValue({
        id: 'new-b-1',
        kitId: 'c1234567-89ab-cdef-0123-456789abcdef',
        clubId: 'club-1',
        start: '2026-11-20T10:00:00.000Z',
        end: '2026-11-20T12:00:00.000Z',
        status: 'RESERVED',
        riskReasons: '[]',
        club: { name: 'Robotics Club', code: 'ROBOTICS' },
      });

      render(
        <AuthProvider>
          <ClubDashboard />
        </AuthProvider>
      );

      // Verify kit was fetched
      await waitFor(() => {
        expect(api.getSharedKit).toHaveBeenCalled();
      });

      // Fill in valid dates & times
      const startDateInput = screen.getByLabelText('Start Date') as HTMLInputElement;
      const startTimeInput = screen.getByLabelText('Start Time') as HTMLInputElement;
      const endDateInput = screen.getByLabelText('End Date') as HTMLInputElement;
      const endTimeInput = screen.getByLabelText('End Time') as HTMLInputElement;

      fireEvent.change(startDateInput, { target: { value: '2026-11-20' } });
      fireEvent.change(startTimeInput, { target: { value: '10:00' } });
      fireEvent.change(endDateInput, { target: { value: '2026-11-20' } });
      fireEvent.change(endTimeInput, { target: { value: '12:00' } });

      // Click Check Availability
      const checkBtn = screen.getByRole('button', { name: /Check Availability/i });
      fireEvent.click(checkBtn);

      await waitFor(() => {
        expect(checkAvailSpy).toHaveBeenCalledWith(
          'c1234567-89ab-cdef-0123-456789abcdef',
          expect.any(String),
          expect.any(String)
        );
      });

      // Click Book Complete Kit
      const bookBtn = screen.getByRole('button', { name: /Book Complete Kit/i });
      fireEvent.click(bookBtn);

      await waitFor(() => {
        expect(createBookingSpy).toHaveBeenCalledWith(
          'c1234567-89ab-cdef-0123-456789abcdef',
          expect.any(String),
          expect.any(String)
        );
      });
    });
  });

  describe('Theme Toggle & Persistence', () => {
    it('initializes with dark theme by default, toggles to light, and persists to localStorage', () => {
      localStorage.clear();

      render(
        <AuthProvider>
          <ThemeProvider>
            <Navbar
              unreadCount={0}
              onOpenNotifications={vi.fn()}
              currentUser={{
                id: 'u1',
                email: 'coord@campus.edu',
                name: 'Coordinator',
                role: 'COORDINATOR',
              }}
            />
          </ThemeProvider>
        </AuthProvider>
      );

      const toggleBtn = screen.getByRole('button', { name: /Switch to Light mode/i });
      expect(toggleBtn).toBeInTheDocument();
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

      // Click to toggle to Light mode
      fireEvent.click(toggleBtn);
      expect(document.documentElement.getAttribute('data-theme')).toBe('light');
      expect(localStorage.getItem('sek-theme')).toBe('light');

      // Click again to toggle back to Dark mode
      fireEvent.click(toggleBtn);
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(localStorage.getItem('sek-theme')).toBe('dark');
    });
  });

  describe('Two-Role Authorization System UI Enforcement', () => {
    it('role utility functions correctly identify ADMIN and USER', () => {
      expect(isAdmin('ADMIN')).toBe(true);
      expect(isAdmin('COORDINATOR')).toBe(true);
      expect(isAdmin('USER')).toBe(false);
      expect(isAdmin('CLUB_MEMBER')).toBe(false);

      expect(isUser('USER')).toBe(true);
      expect(isUser('CLUB_MEMBER')).toBe(true);
      expect(isUser('ADMIN')).toBe(false);

      expect(getDisplayRole('COORDINATOR')).toBe('ADMIN');
      expect(getDisplayRole('CLUB_MEMBER')).toBe('USER');
    });

    it('renders ADMIN badge and coordinator indicator when logged in as ADMIN', () => {
      render(
        <AuthProvider>
          <Navbar
            unreadCount={0}
            onOpenNotifications={vi.fn()}
            currentUser={{
              id: 'admin-1',
              email: 'coordinator@campus.edu',
              name: 'Operations Coordinator',
              role: 'COORDINATOR',
            }}
          />
        </AuthProvider>
      );

      expect(screen.getByText('ADMIN')).toBeInTheDocument();
      expect(screen.getByText('Coordinator')).toBeInTheDocument();
      expect(screen.queryByText(/Club:/i)).not.toBeInTheDocument();
    });

    it('renders USER badge and club name when logged in as USER', () => {
      render(
        <AuthProvider>
          <Navbar
            unreadCount={0}
            onOpenNotifications={vi.fn()}
            currentUser={{
              id: 'user-1',
              email: 'robotics_lead@campus.edu',
              name: 'Alex Rivera',
              role: 'CLUB_MEMBER',
              club: { id: 'c1', name: 'Robotics Club', code: 'ROBOTICS' },
            }}
          />
        </AuthProvider>
      );

      expect(screen.getByText('USER')).toBeInTheDocument();
      expect(screen.getByText(/Club: Robotics Club/i)).toBeInTheDocument();
    });

    it('LoginPage provides demo buttons for Admin and both Club Users', () => {
      render(
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      );

      // Verify all 3 demo buttons exist and have ADMIN / USER tags
      expect(screen.getByText('Coordinator')).toBeInTheDocument();
      expect(screen.getByText('Robotics Club')).toBeInTheDocument();
      expect(screen.getByText('Drama Society')).toBeInTheDocument();

      const dramaBtn = screen.getByText('Drama Society');
      const emailInput = screen.getByPlaceholderText('e.g. coordinator@campus.edu') as HTMLInputElement;
      fireEvent.click(dramaBtn);
      expect(emailInput.value).toBe('drama_lead@campus.edu');
    });
  });
});

