'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useAuth, useLogoutMutation, useAuthNavigation } from '@/features/auth';
import { useTaskList, useTaskNavigation } from '@/features/tasks';
import { useCrmNavigation } from '@/features/crm';
import { AddLeadModal } from '@/features/crm/components/AddLeadModal';
import { AttendanceCard } from '@/features/attendance';
import { NotificationPanel, useUnreadCount } from '@/features/notifications';
import { MeetingWidget } from '@/features/meetings';

export default function AgentDashboardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationResults, setLocationResults] = useState<
    Array<{ name: string; address: string; latitude: number; longitude: number }>
  >([]);
  const [isOffline, setIsOffline] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const { logout, user } = useAuth();
  const { mutate: logoutMutate, isPending: isLoggingOut } = useLogoutMutation();
  const { goToProfile } = useAuthNavigation();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Agent';
  const userRole = user?.access_role ?? user?.internal_role ?? null;

  const { data: tasks = [], isLoading: isLoadingTasks } = useTaskList();
  const { goToTasksList, goToMapScreen } = useTaskNavigation();
  const { goToCrm } = useCrmNavigation();
  const { count: unreadCount = 0 } = useUnreadCount();

  const pendingTasks = useMemo(() => tasks.filter((t) => t.status === 'pending'), [tasks]);

  const isSameDay = useCallback((dateStr: string | null, target: Date): boolean => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return (
      d.getFullYear() === target.getFullYear() &&
      d.getMonth() === target.getMonth() &&
      d.getDate() === target.getDate()
    );
  }, []);

  // Offline status tracking
  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Mapbox Geocoding Search
  const searchMapboxPlaces = useCallback(async (query: string) => {
    if (!query.trim()) {
      setLocationResults([]);
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) return;

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&country=NG&limit=5`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.features) {
        const places = data.features.map(
          (feature: { text: string; place_name: string; center: [number, number] }) => ({
            name: feature.text,
            address: feature.place_name,
            longitude: feature.center[0],
            latitude: feature.center[1],
          })
        );
        setLocationResults(places);
      }
    } catch {
      // Geocoding is non-critical — silent failure is acceptable
    }
  }, []);

  const handleLocationQueryChange = (text: string) => {
    setLocationQuery(text);
    searchMapboxPlaces(text);
  };

  // Weekly calendar strip mapping
  const calendarDays = useMemo(() => {
    const today = new Date();
    const currentDayOfWeek = today.getDay();
    const distanceToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + distanceToMonday);
    const daysOfWeek = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    return daysOfWeek.map((dayName, index) => {
      const dateObj = new Date(monday);
      dateObj.setDate(monday.getDate() + index);
      return { day: dayName, date: dateObj.getDate(), fullDate: dateObj };
    });
  }, []);

  const handleConfirmLogout = () => {
    logoutMutate(undefined, {
      onSettled: () => {
        logout();
      },
    });
  };

  const formattedSelectedDate = useMemo(() => {
    const day = selectedDate.getDate().toString().padStart(2, '0');
    const month = (selectedDate.getMonth() + 1).toString().padStart(2, '0');
    const year = selectedDate.getFullYear();
    return `${day}/${month}/${year}`;
  }, [selectedDate]);

  return (
    <ScreenErrorBoundary screenName="AgentHome">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-x-hidden pb-10">
        {/* Ambient background texture */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-[0.12] z-0"
          style={{ backgroundImage: "url('/assets/app-background.png')" }}
        />

        {/* Scroll Content container */}
        <div className="relative z-10 flex flex-col flex-1 px-5 pt-6">
          {/* Header */}
          <div className="relative flex items-center justify-between mb-4 h-16">
            {isSearching ? (
              <div className="flex-1 flex items-center gap-3">
                <div className="flex-1 flex items-center bg-white/[0.08] rounded-full px-4 h-12">
                  <input
                    type="text"
                    placeholder="Search tasks, leads..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    autoFocus
                    className="flex-1 bg-transparent text-white placeholder-white/40 text-sm focus:outline-none border-none p-0"
                  />
                </div>
                <button
                  onClick={() => {
                    setIsSearching(false);
                    setSearchQuery('');
                  }}
                  className="text-sm font-semibold text-[#7BB6B8] focus:outline-none"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                {/* Profile Row */}
                <div
                  onClick={() => setIsProfileMenuOpen((v) => !v)}
                  className="flex items-center gap-3.5 cursor-pointer"
                >
                  <img
                    src="/assets/animoji.png"
                    alt="avatar"
                    className="w-14 h-14 rounded-full bg-[#0B3343] border border-white/10"
                  />
                  <div className="flex flex-col justify-center leading-tight">
                    <span className="text-white/60 font-light text-sm">Hello,</span>
                    <span className="text-white font-semibold text-2xl mt-0.5">{firstName}!</span>
                    {userRole && (
                      <span className="text-[10px] font-semibold tracking-wider text-[#75ADAF] uppercase mt-1">
                        {userRole}
                      </span>
                    )}
                  </div>
                </div>

                {/* Header Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsSearching(true);
                    }}
                    className="w-12 h-12 flex items-center justify-center bg-transparent focus:outline-none"
                  >
                    <img src="/assets/search-icon.png" alt="Search" className="w-10 h-10 object-contain" />
                  </button>
                  <button
                    onClick={() => setIsNotificationOpen(true)}
                    className="relative w-12 h-12 flex items-center justify-center bg-transparent focus:outline-none"
                  >
                    <img src="/assets/notification-icon.png" alt="Notification" className="w-10 h-10 object-contain" />
                    {unreadCount > 0 && (
                      <div className="absolute top-1 right-1 min-w-4 h-4 bg-[#FD6046] text-white font-bold text-[9px] rounded-full flex items-center justify-center px-1">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </div>
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Profile Dropdown Menu */}
            {isProfileMenuOpen && (
              <>
                <div onClick={() => setIsProfileMenuOpen(false)} className="fixed inset-0 z-40" />
                <div className="absolute left-0 top-16 w-48 bg-[#0F2D3D] border border-white/10 rounded-2xl shadow-2xl z-50 py-1 flex flex-col font-sans">
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      goToProfile();
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] text-white text-sm text-left focus:outline-none"
                  >
                    <span>👤</span>
                    <span>My Profile</span>
                  </button>
                  <div className="h-px bg-white/5 mx-3" />
                  <button
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsLogoutModalOpen(true);
                    }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.04] text-[#FD6046] text-sm text-left focus:outline-none font-semibold"
                  >
                    <span>🚪</span>
                    <span>Log Out</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Calendar strip */}
          <div className="w-full flex items-center justify-between py-3 px-1.5 bg-white/[0.02] border border-white/5 rounded-2xl mb-5 gap-1.5 overflow-x-auto scrollbar-none">
            {calendarDays.map((item, index) => {
              const isActive = selectedDate.toDateString() === item.fullDate.toDateString();
              const hasTasks = tasks.some((t) => isSameDay(t.dueDate, item.fullDate));
              return (
                <button
                  key={index}
                  onClick={() => setSelectedDate(item.fullDate)}
                  className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-xl min-w-[38px] transition-all active:scale-95 ${
                    isActive ? 'bg-[#7BB6B8] text-white' : 'bg-transparent text-white/40'
                  }`}
                >
                  <span className={`text-[9px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : 'text-white/40'}`}>
                    {item.day}
                  </span>
                  <span className={`text-sm font-semibold mt-1.5 ${isActive ? 'text-white font-bold' : 'text-white/80'}`}>
                    {item.date}
                  </span>
                  {hasTasks && (
                    <div className={`w-1.5 h-1.5 rounded-full mt-1.5 ${isActive ? 'bg-white' : 'bg-[#FD6046]'}`} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Action Row Buttons */}
          <div className="flex gap-2 mb-5">
            <button
              onClick={goToTasksList}
              className="flex-1 h-11 bg-[#0B3343] border border-white/10 hover:border-white/20 rounded-full flex items-center justify-center gap-1.5 px-3 focus:outline-none transition-all active:scale-95 text-xs text-white"
            >
              <img src="/assets/task-daily-01.png" alt="Task" className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold truncate">Task</span>
              {pendingTasks.length > 0 && (
                <span className="min-w-4 h-4 bg-[#FD6046] text-white font-bold text-[8px] rounded-full flex items-center justify-center px-1 flex-shrink-0 ml-0.5">
                  {pendingTasks.length}
                </span>
              )}
            </button>

            <div className="flex-[1.5] h-11 bg-[#113948] rounded-full flex items-center p-1 gap-1 min-w-0">
              <img src="/assets/calendar-icon.png" alt="Calendar" className="w-8 h-8 flex-shrink-0" />
              <div className="flex-1 bg-[#09232D] h-full rounded-full flex items-center justify-center px-2 min-w-0">
                <span className="text-[10px] text-white/90 truncate font-medium">{formattedSelectedDate}</span>
              </div>
            </div>

            <button
              onClick={() => setIsAddLeadOpen(true)}
              className="flex-1 h-11 bg-[#0B3343] border border-white/10 hover:border-white/20 rounded-full flex items-center justify-center gap-1.5 px-3 focus:outline-none transition-all active:scale-95 text-xs text-white"
            >
              <img src="/assets/bookmark-add-02.png" alt="Add Lead" className="w-4 h-4 flex-shrink-0" />
              <span className="font-semibold truncate">Add Lead</span>
            </button>
          </div>

          {/* Dashboard cards: Leads + Attendance */}
          <div className="flex gap-3.5 mb-5 items-stretch">
            {/* Leads card */}
            <div className="flex-1 bg-white rounded-2xl flex flex-col justify-between overflow-hidden shadow-lg p-4 gap-2 text-black">
              <div className="flex items-center gap-2">
                <img src="/assets/upload-avatar.png" alt="Leads" className="w-12 h-12 object-contain" />
                <div className="flex-1 min-w-0">
                  {isLoadingTasks ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="font-bold text-2xl text-[#34373C] leading-none">
                        {tasks.length > 0 ? tasks.length.toLocaleString() : '0'}
                      </span>
                      <span className="text-[10px] text-gray-500 font-semibold uppercase">Leads</span>
                    </div>
                  )}
                  <p className="text-[9px] text-gray-400 font-medium">Uploaded by you</p>
                </div>
              </div>
              <button
                onClick={goToCrm}
                className="flex items-center justify-between w-full text-left pt-2 border-t border-gray-100 focus:outline-none"
              >
                <span className="text-[10px] text-gray-500 font-semibold uppercase">View Leads</span>
                <span className="text-sm text-gray-400 font-bold leading-none mt-0.5">›</span>
              </button>
            </div>

            {/* Attendance card */}
            <div className="flex-1 flex">
              <AttendanceCard />
            </div>
          </div>

          {/* Meetings Calendar Widget */}
          <div className="mb-5">
            <MeetingWidget selectedDate={selectedDate} />
          </div>

          {/* View Route row */}
          <div className="flex justify-center mb-6">
            <button
              onClick={() => goToMapScreen()}
              className="flex items-center gap-2 bg-[#0B3343] border border-white/10 hover:border-white/20 hover:bg-[#0D3B4E] rounded-full px-5 py-2.5 active:scale-95 transition-all text-xs font-semibold text-white focus:outline-none"
            >
              <img src="/assets/route-01.png" alt="Route" className="w-3.5 h-3.5" />
              <span>View Route</span>
            </button>
          </div>

          {/* Find Location panel */}
          <div
            className="bg-[#FFFFFF] border-t border-gray-200 rounded-t-[28px] p-5 shadow-xl -mx-5 px-5 flex flex-col gap-4 text-black pb-12"
            style={{ backgroundImage: "url('/assets/find-location-backgroud.png')", backgroundSize: 'stretch', backgroundRepeat: 'no-repeat' }}
          >
            {/* Search row */}
            <div className="flex items-center bg-white/40 border border-white/50 backdrop-blur-md rounded-full p-1 h-14 gap-2">
              <img src="/assets/magnifying-icon.png" alt="Search icon" className="w-10 h-10 object-contain ml-1" />
              <div className="flex-1 bg-[#D6D7D7] h-full rounded-full flex items-center px-4">
                <input
                  type="text"
                  placeholder="Where To?"
                  value={locationQuery}
                  onChange={(e) => handleLocationQueryChange(e.target.value)}
                  className="w-full bg-transparent border-none text-[#113948] font-medium text-sm focus:outline-none placeholder-[#113948]/60 p-0"
                />
              </div>
            </div>

            {/* Geocode Search results */}
            {isOffline ? (
              <div className="flex flex-col items-center justify-center py-4 gap-2 text-center select-none">
                <img src="/assets/location-offline-03.png" alt="Offline" className="w-6 h-6 object-contain opacity-50" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">No Recent Location</span>
              </div>
            ) : locationResults.length === 0 ? (
              <div className="flex items-center justify-center py-6 select-none">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  {locationQuery.trim() ? 'No results found' : 'Type a location to search'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-3.5">
                {locationResults.map((item, index) => (
                  <div
                    key={index}
                    onClick={() =>
                      goToMapScreen({
                        name: item.name,
                        address: item.address,
                        latitude: item.latitude,
                        longitude: item.longitude,
                      })
                    }
                    className="flex items-center gap-3 cursor-pointer active:opacity-75 transition-opacity"
                  >
                    <img src="/assets/location-icon.png" alt="Location" className="w-9 h-9 object-contain flex-shrink-0" />
                    <div className="flex-1 min-w-0 leading-tight">
                      <p className="text-xs font-bold text-[#09232D] truncate">{item.name}</p>
                      <p className="text-[9px] text-[#09232D]/60 truncate mt-1">{item.address}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Drawer */}
      <NotificationPanel open={isNotificationOpen} onClose={() => setIsNotificationOpen(false)} />

      {/* Add Lead Modal */}
      <AddLeadModal visible={isAddLeadOpen} onClose={() => setIsAddLeadOpen(false)} />

      {/* Logout modal */}
      {isLogoutModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
          <div onClick={() => !isLoggingOut && setIsLogoutModalOpen(false)} className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" />
          <div className="relative bg-[#0B1E26] border border-white/10 rounded-2xl w-full max-w-xs p-6 shadow-2xl z-10 flex flex-col gap-4 font-sans text-center">
            <h3 className="font-bold text-lg text-white">Log Out</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Are you sure you want to log out of your account?
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={() => setIsLogoutModalOpen(false)}
                disabled={isLoggingOut}
                className="flex-1 h-11 border border-white/15 rounded-full text-xs font-semibold text-white hover:bg-white/5 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
                className="flex-1 h-11 bg-[#FD6046] hover:bg-[#E0533C] rounded-full text-xs font-semibold text-white active:scale-95 transition-all flex items-center justify-center"
              >
                {isLoggingOut ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  'Log Out'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </ScreenErrorBoundary>
  );
}
