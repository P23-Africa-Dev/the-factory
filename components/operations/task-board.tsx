'use client';

import React, { useState } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { DndContainer, DndItem, TaskCategory } from '@/types/operations';
import { TaskColumn } from './task-column';
import { TaskCard } from './task-card';

interface TaskBoardProps {
  containers: DndContainer[];
  activeTab: TaskCategory;
  onAddCard: (containerId: string, item: DndItem) => void;
  findContainer: (id: string) => DndContainer | undefined;
  moveItem: (activeId: string, overId: string, containerId: string) => void;
  moveToContainer: (activeId: string, overContainerId: string) => void;
  moveBetweenContainers: (
    activeId: string,
    overId: string,
    activeContainerId: string,
    overContainerId: string
  ) => void;
}

export function TaskBoard({
  containers,
  activeTab,
  onAddCard,
  findContainer,
  moveItem,
  moveToContainer,
  moveBetweenContainers,
}: TaskBoardProps) {
  const [activeItem, setActiveItem] = useState<DndItem | null>(null);

  // Filter items per tab
  const filteredContainers = containers.map((c) => ({
    ...c,
    items:
      activeTab === 'all'
        ? c.items
        : c.items.filter((item) => item.category === activeTab),
  }));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const container = findContainer(active.id as string);
    const item = container?.items.find((i) => i.id === active.id);
    setActiveItem(item ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overIsContainer = containers.some((c) => c.id === overId);
    const overContainer = overIsContainer
      ? containers.find((c) => c.id === overId)
      : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer.id === overContainer.id) return;
    if (overIsContainer) {
      moveToContainer(activeId, overId);
    } else {
      moveBetweenContainers(activeId, overId, activeContainer.id, overContainer.id);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overIsContainer = containers.some((c) => c.id === overId);
    const overContainer = overIsContainer
      ? containers.find((c) => c.id === overId)
      : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeId !== overId && activeContainer.id === overContainer.id) {
      moveItem(activeId, overId, activeContainer.id);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredContainers.map((container) => (
          <TaskColumn
            key={container.id}
            id={container.id}
            title={container.title}
            color={container.color}
            items={container.items}
            onAddCard={(item) => onAddCard(container.id, item)}
          />
        ))}
      </div>

      <DragOverlay>
        {activeItem ? (
          <div className="shadow-2xl scale-105 pointer-events-none">
            <TaskCard item={activeItem} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
