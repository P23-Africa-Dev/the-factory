"use client";

import React, { useState, useMemo } from 'react';
import { Filter, MessageSquarePlus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TaskBoard } from '@/components/operations/task-board';
import { OperationsCalendar } from '@/components/operations/operations-calendar';
import { CreateTaskModal } from '@/components/operations/create-task-modal';
import { useDragAndDrop } from '@/lib/hooks/use-tasks-dnd';
import type { DndContainer, DndItem, TaskCategory } from '@/types/operations';

// ─── Initial Data ────────────────────────────────────────────────────────────
const INITIAL_DATA: DndContainer[] = [
  {
    id: 'pending',
    title: 'Pending Task',
    color: '#BD7A22',
    items: [
      { id: 'task-1', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'agent' },
      { id: 'task-4', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'attendance' },
      { id: 'task-7', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'agent' },
    ],
  },
  {
    id: 'in-progress',
    title: 'Task In-Progress',
    color: '#094B5C',
    items: [
      { id: 'task-2', label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV', location: 'Computer Village, Ikeja, Otigba, Ikeja, Lagos', time: '12 hours ago', category: 'attendance' },
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
  const radius = outerRadius + 22;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <circle cx={x} cy={y} r={16} fill="white" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fill="#0B1215" fontSize={9} fontWeight={800}>
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
              <div className="flex gap-1 bg-white rounded-full p-1 shadow-sm border border-gray-100">
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`px-5 py-2 rounded-full text-xs font-bold transition-all ${
                      activeTab === tab.value
                        ? 'bg-[#0B1215] text-white shadow-sm'
                        : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-50 transition-colors shadow-sm">
                  <span>Filter</span>
                  <Filter size={14} />
                </button>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 px-5 py-2 bg-[#0B1215] text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition-colors shadow-lg"
                >
                  <span>Create New Task</span>
                  <MessageSquarePlus size={14} />
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
            />
          </div>

          {/* ── Right Sidebar ────────────────────────────── */}
          <div className="w-full xl:w-72 2xl:w-80 flex flex-col gap-5 shrink-0">

            {/* Calendar */}
            <OperationsCalendar />

            {/* Task Stats */}
            <div className="bg-[#0B1215] rounded-[28px] p-5 shadow-xl">
              <h3 className="text-gray-400 font-medium text-xs uppercase tracking-wide mb-4">
                Task Stats
              </h3>

              <div className="flex items-center gap-3">
                {/* Donut Chart */}
                <div className="w-36 h-36 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats}
                        cx="50%"
                        cy="50%"
                        innerRadius={38}
                        outerRadius={58}
                        paddingAngle={4}
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
                <div className="space-y-3">
                  {stats.map((stat, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: stat.color }}
                      />
                      <span className="text-xs text-gray-400 font-medium">{stat.name}</span>
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
    </div>
  );
}
