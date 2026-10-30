'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Mail, MapPin, Phone, User, ChevronsLeftRight } from 'lucide-react';
import type { LeadContact } from '../types';

interface LeadContactsStackProps {
  contacts: LeadContact[];
}

export function LeadContactsStack({ contacts }: LeadContactsStackProps) {
  // If contacts is empty, we don't render anything
  if (!contacts || contacts.length === 0) {
    return (
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-5 text-center text-xs text-white/40 italic">
        No contacts available.
      </div>
    );
  }

  const [currentIndex, setCurrentIndex] = useState(0);

  // If there's only 1 contact, render it as a single static card
  if (contacts.length === 1) {
    const contact = contacts[0];
    return (
      <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col relative overflow-hidden">
        <div className="flex items-center gap-3 border-b border-white/10 pb-3 mb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B3A4B] text-[#44AFCD] border border-[#44AFCD]/20">
            <User size={16} />
          </div>
          <div>
            <h4 className="font-bold text-[15px] text-white leading-tight">{contact.name}</h4>
            <span className="text-[9px] font-bold uppercase tracking-wider text-[#44AFCD] bg-[#44AFCD]/10 px-2 py-0.5 rounded-full mt-1 inline-block">
              Primary Contact
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 text-sm text-white/70">
          {contact.email && (
            <a href={`mailto:${contact.email}`} className="flex items-center gap-2.5 hover:text-white transition-colors">
              <Mail size={14} className="text-[#44AFCD]/80" />
              <span className="truncate">{contact.email}</span>
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`} className="flex items-center gap-2.5 hover:text-white transition-colors">
              <Phone size={14} className="text-[#44AFCD]/80" />
              <span>{contact.phone}</span>
            </a>
          )}
          {contact.location && (
            <div className="flex items-center gap-2.5">
              <MapPin size={14} className="text-[#44AFCD]/80" />
              <span className="truncate">{contact.location}</span>
            </div>
          )}
          {!contact.email && !contact.phone && !contact.location && (
            <span className="text-xs text-white/40 italic">No contact details recorded.</span>
          )}
        </div>
      </div>
    );
  }

  // Swipe handlers for multiple cards
  const handleSwipeAway = (direction: 'left' | 'right') => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % contacts.length);
  };

  // We only show up to 3 cards in the stack at any time
  const visibleCards = [];
  for (let i = 0; i < Math.min(contacts.length, 3); i++) {
    const contactIndex = (currentIndex + i) % contacts.length;
    visibleCards.push({
      contact: contacts[contactIndex],
      index: i, // 0 is top card, 1 is middle, 2 is bottom
      originalIndex: contactIndex,
    });
  }

  // Reverse so the top card (index 0) is rendered last (on top of others)
  visibleCards.reverse();

  return (
    <div className="flex flex-col gap-3">
      {/* Title / Pager Row */}
      <div className="flex items-center justify-between px-1">
        <h4 className="font-bold text-sm text-white flex items-center gap-1.5">
          <span>Contacts</span>
          <span className="text-[10px] text-white/40 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 font-medium">
            {contacts.length} total
          </span>
        </h4>
        <div className="flex items-center gap-1">
          <span className="text-[11px] font-bold text-[#44AFCD]">
            Card {currentIndex + 1} of {contacts.length}
          </span>
          <span className="text-[9px] text-white/40 italic ml-1 flex items-center gap-1">
            (swipe to browse <ChevronsLeftRight size={10} className="inline animate-pulse" />)
          </span>
        </div>
      </div>

      {/* Stack Container */}
      <div className="relative h-[180px] w-full mt-1 overflow-visible">
        <AnimatePresence mode="popLayout">
          {visibleCards.map(({ contact, index, originalIndex }) => {
            const isTop = index === 0;

            return (
              <SwipeableCard
                key={`${originalIndex}-${contact.name}`}
                contact={contact}
                isTop={isTop}
                stackIndex={index}
                onSwipe={handleSwipeAway}
              />
            );
          })}
        </AnimatePresence>
      </div>

      {/* Navigation Dot Indicators */}
      <div className="flex justify-center gap-1.5 mt-1.5">
        {contacts.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx)}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              currentIndex === idx ? 'w-4 bg-[#44AFCD]' : 'w-1.5 bg-white/20'
            }`}
            aria-label={`Go to contact ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

interface SwipeableCardProps {
  contact: LeadContact;
  isTop: boolean;
  stackIndex: number;
  onSwipe: (dir: 'left' | 'right') => void;
}

function SwipeableCard({ contact, isTop, stackIndex, onSwipe }: SwipeableCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-150, 150], [-12, 12]);
  const opacity = useTransform(x, [-150, 0, 150], [0.5, 1, 0.5]);

  // Style properties based on position in stack
  const scale = isTop ? 1 : stackIndex === 1 ? 0.95 : 0.9;
  const translateY = isTop ? 0 : stackIndex === 1 ? 10 : 20;
  const rotateZ = isTop ? 0 : stackIndex === 1 ? 1.5 : -1.5;
  const zIndex = 30 - stackIndex;

  const handleDragEnd = (event: any, info: any) => {
    const threshold = 100;
    if (info.offset.x > threshold) {
      onSwipe('right');
    } else if (info.offset.x < -threshold) {
      onSwipe('left');
    }
  };

  return (
    <motion.div
      style={isTop ? { x, rotate, opacity, zIndex } : { zIndex }}
      drag={isTop ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      onDragEnd={handleDragEnd}
      animate={{
        scale,
        y: translateY,
        rotate: isTop ? undefined : rotateZ,
      }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      exit={{ x: x.get() > 0 ? 300 : -300, opacity: 0, transition: { duration: 0.2 } }}
      className={`absolute inset-0 bg-[#0F2D3D] border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col h-[170px] select-none ${
        isTop ? 'cursor-grab active:cursor-grabbing' : 'pointer-events-none'
      }`}
    >
      {/* Glow highlight for the top card */}
      {isTop && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-[#44AFCD]/5 to-transparent pointer-events-none" />
      )}

      <div className="flex items-center gap-3 border-b border-white/5 pb-2 mb-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#163645] text-[#44AFCD] border border-[#44AFCD]/10">
          <User size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-[14px] text-white leading-tight truncate">{contact.name}</h4>
          <span className="text-[8px] font-bold uppercase tracking-wider text-white/50">
            {stackIndex === 0 && isTop ? 'Primary Contact' : `Contact`}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 text-xs text-white/70">
        {contact.email && (
          <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-white transition-colors truncate">
            <Mail size={12} className="text-[#44AFCD]/70 shrink-0" />
            <span className="truncate">{contact.email}</span>
          </a>
        )}
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="flex items-center gap-2 hover:text-white transition-colors truncate">
            <Phone size={12} className="text-[#44AFCD]/70 shrink-0" />
            <span>{contact.phone}</span>
          </a>
        )}
        {contact.location && (
          <div className="flex items-center gap-2 truncate">
            <MapPin size={12} className="text-[#44AFCD]/70 shrink-0" />
            <span className="truncate">{contact.location}</span>
          </div>
        )}
        {!contact.email && !contact.phone && !contact.location && (
          <span className="text-xs text-white/30 italic">No details provided.</span>
        )}
      </div>
    </motion.div>
  );
}
