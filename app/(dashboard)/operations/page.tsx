"use client";

import React, { useState, useMemo } from 'react';
import { SlidersHorizontal, BookmarkPlus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TaskBoard } from '@/components/operations/task-board';
import { OperationsCalendar } from '@/components/operations/operations-calendar';
import { CreateTaskModal } from '@/components/operations/create-task-modal';
import { TaskDetailModal } from '@/components/operations/task-detail-modal';
import { useDragAndDrop } from '@/lib/hooks/use-tasks-dnd';
import type { DndContainer, DndItem, TaskCategory } from '@/types/operations';

// ─── Initial Data ────────────────────────────────────────────────────────────
const INITIAL_DATA: DndContainer[] = [
  {
    id: 'pending',
    title: 'Pending Task',
    color: '#BD7A22',
    items: [
      { 
        id: 'task-1', 
        label: 'Francis Nasyomba', 
        description: 'Cover the entirety of Ikeja CV', 
        location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', 
        time: '12 hours ago', 
        category: 'agent',
        dueDate: 'Tomorrow (Friday, 3rd April. 2026)',
        assignedBy: 'Ridwan Thomson (Supervisor)',
        addedDescription: 'Visit the Ikeja Computer village, and promote (product name) to the target audience there.\n\nSpeak with the business owner and note:\n- Contact Details\n- Prospect brief\n- Any other usable details.',
        statusLabel: 'Pending'
      },
      { id: 'task-4', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'attendance' },
      { id: 'task-7', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'agent' },
    ],
  },
  {
    id: 'in-progress',
    title: 'Task In-Progress',
    color: '#094B5C',
    items: [
      { 
        id: 'task-2', 
        label: 'Francis Nasyomba', 
        description: 'Cover the entirety of Ikeja CV', 
        location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', 
        time: '12 hours ago', 
        category: 'attendance',
        dueDate: 'Tomorrow (Friday, 3rd April. 2026)',
        assignedBy: 'Ridwan Thomson (Supervisor)',
        addedDescription: 'Visit the Ikeja Computer village, and promote (product name) to the target audience there.\n\nSpeak with the business owner and note:\n- Contact Details\n- Prospect brief\n- Any other usable details.',
        statusLabel: 'In Progress'
      },
      { id: 'task-5', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'agent' },
      { id: 'task-8', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'attendance' },
    ],
  },
  {
    id: 'completed',
    title: 'Completed Task',
    color: '#4FD1C5',
    items: [
      { id: 'task-3', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'agent' },
      { id: 'task-6', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'attendance' },
    ],
  },
];

interface CustomLabelProps {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  value?: number;
}

function CustomLabel({ cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, value = 0 }: CustomLabelProps) {
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <circle cx={x} cy={y} r={22} fill="white" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#0B1215" fontSize={12} fontWeight={800}>
        {value}%
      </text>
    </g>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS: { value: TaskCategory; label: string }[] = [
  { value: 'all', label: 'All Task' },
  { value: 'agent', label: 'Agents' },
  { value: 'attendance', label: 'Attendance' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OperationsPage() {
  const { containers, addItem, moveItem, moveToContainer, moveBetweenContainers, findContainer } =
    useDragAndDrop(INITIAL_DATA);

  const [activeTab, setActiveTab] = useState<TaskCategory>('all');
  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{item: DndItem, containerId: string} | null>(null);

  // Dynamic stats
  const stats = useMemo(() => {
    const total = containers.reduce((s, c) => s + c.items.length, 0);
    if (total === 0) return [
      { name: 'Pending', value: 0, color: '#BD7A22' },
      { name: 'In Progress', value: 0, color: '#094B5C' },
      { name: 'Complete', value: 0, color: '#4FD1C5' },
    ];
    const pending = containers.find((c) => c.id === 'pending')?.items.length ?? 0;
    const inProgress = containers.find((c) => c.id === 'in-progress')?.items.length ?? 0;
    const completed = containers.find((c) => c.id === 'completed')?.items.length ?? 0;
    return [
      { name: 'Pending', value: Math.round((pending / total) * 100), color: '#BD7A22' },
      { name: 'In Progress', value: Math.round((inProgress / total) * 100), color: '#094B5C' },
      { name: 'Complete', value: Math.round((completed / total) * 100), color: '#4FD1C5' },
    ];
  }, [containers]);

  const handleCreateTask = (containerId: string, item: DndItem) => {
    addItem(containerId, item);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col xl:flex-row gap-6">

          {/* ── Main Area ────────────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col gap-5">

            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              {/* Tabs */}
              <div className="flex gap-1 bg-white rounded-full p-1.5 border border-gray-100">
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                      activeTab === tab.value
                        ? 'bg-[#0B1215] text-white shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-4">
                <button className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 rounded-full text-sm font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                  <span>Filter</span>
                  <SlidersHorizontal size={14} className="opacity-70" />
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-6 py-2.5 bg-[#0B1215] text-white rounded-full text-sm font-semibold hover:bg-slate-800 transition-colors shadow-md"
                >
                  <span>Create New Task</span>
                  <BookmarkPlus size={16} />
                </button>
              </div>
            </div>

            {/* Kanban Board */}
            <TaskBoard
              containers={containers}
              activeTab={activeTab}
              onAddCard={addItem}
              findContainer={findContainer}
              moveItem={moveItem}
              moveToContainer={moveToContainer}
              moveBetweenContainers={moveBetweenContainers}
              onTaskClick={(item, containerId) => setSelectedTask({ item, containerId })}
            />
          </div>

          {/* ── Right Sidebar ────────────────────────────── */}
          <div className="w-full xl:w-[360px] 2xl:w-[420px] flex flex-col gap- shrink-0">

            {/* Calendar */}
            <OperationsCalendar />

            {/* Task Stats */}
            <div className="bg-[#0A1A22] rounded-[32px] p-7 shadow-xl mt- relative overflow-hidden">
              <h3 className="text-gray-400 font-medium text-[15px] mb-6">
                Task Stats
              </h3>

              <div className="flex items-center gap-3">
                {/* Donut Chart */}
                <div className="w-48 h-48 shrink-0 relative -left-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={78}
                        paddingAngle={0}
                        dataKey="value"
                        stroke="none"
                        labelLine={false}
                        label={(props) => <CustomLabel {...props} />}
                      >
                        {stats.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Legend */}
                <div className="space-y-4">
                  {stats.map((stat, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full shrink-0"
                        style={{ backgroundColor: stat.color }}
                      />
                      <span className="text-[13px] text-gray-400 font-medium">{stat.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreateTask={handleCreateTask}
      />

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask?.item ?? null}
        status={selectedTask?.containerId ?? ''}
      />
    </div>
  );
}
