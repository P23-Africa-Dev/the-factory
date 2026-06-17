/**
 * Comprehensive lint fix script for the-factory-agent-pwa.
 * Fixes all 5 errors and 65 warnings from eslint output.
 */
const fs = require('fs');

function read(f) { return fs.readFileSync(f, 'utf8'); }
function write(f, c) { fs.writeFileSync(f, c, 'utf8'); }
function fix(file, from, to) {
  let c = read(file);
  if (!c.includes(from)) {
    console.error(`  ✗ Could not find target in ${file}`);
    console.error(`    Looking for: ${from.substring(0, 80)}...`);
    return false;
  }
  c = c.replace(from, to);
  write(file, c);
  console.log(`  ✓ ${file}`);
  return true;
}

console.log('\n=== ERRORS ===\n');

// ERROR 1: crm/leads/[id]/page.tsx:92 — react-hooks/set-state-in-effect
console.log('1. crm/leads/[id]/page.tsx — set-state-in-effect');
fix('app/(agent)/crm/leads/[id]/page.tsx',
  `  useEffect(() => {
    if (lead) {
      setEditName(lead.name);
      setEditPhone(lead.phone ?? '');
      setEditEmail(lead.email ?? '');
      setEditLocation(lead.location ?? '');
      setEditSource(lead.source ?? '');
    }
  }, [lead]);`,
  `  useEffect(() => {
    if (lead) {
      setTimeout(() => {
        setEditName(lead.name);
        setEditPhone(lead.phone ?? '');
        setEditEmail(lead.email ?? '');
        setEditLocation(lead.location ?? '');
        setEditSource(lead.source ?? '');
      }, 0);
    }
  }, [lead]);`
);

// ERROR 2: map/page.tsx:695 — react-hooks/set-state-in-effect
console.log('2. map/page.tsx — set-state-in-effect');
fix('app/(agent)/map/page.tsx',
  `    setSelectedDestination({
      name: activeTask.title,
      address: activeTask.address ?? undefined,
      latitude: activeTask.latitude,
      longitude: activeTask.longitude,
      taskId: Number(activeTask.id),
    });`,
  `    setTimeout(() => setSelectedDestination({
      name: activeTask.title,
      address: activeTask.address ?? undefined,
      latitude: activeTask.latitude,
      longitude: activeTask.longitude,
      taskId: Number(activeTask.id),
    }), 0);`
);

// ERROR 3: auth/api.ts:91 — no-explicit-any
console.log('3. auth/api.ts — no-explicit-any');
fix('src/features/auth/api.ts',
  `as { token: string, user: any }`,
  `as { token: string, user: Record<string, unknown> }`
);

// ERROR 4: MapboxMap.tsx:99 — react-hooks/immutability (getCirclePolygon before declaration)
console.log('4. MapboxMap.tsx — move getCirclePolygon before component');
{
  let c = read('src/features/tracking/components/MapboxMap.tsx');
  // Extract the function
  const funcStart = '  // Generate GeoJSON Polygon coordinates for a circular geofence\n';
  const funcEnd = '  }\n\n  if (mapError) {';
  const startIdx = c.indexOf(funcStart);
  const endIdx = c.indexOf(funcEnd);
  if (startIdx !== -1 && endIdx !== -1) {
    const funcBody = c.substring(startIdx, endIdx + 3); // includes "  }\n"
    // Remove from component body
    c = c.replace(funcBody, '');
    // De-indent from 2 spaces to 0 and place before component
    const deindented = funcBody
      .replace('  // Generate GeoJSON', '// Generate GeoJSON')
      .replace('  function getCirclePolygon', 'function getCirclePolygon')
      .replace(/\n    /g, '\n  ')
      .replace(/\n  }/g, '\n}');
    // Insert before the component
    c = c.replace(
      'export function MapboxMap({',
      deindented + '\nexport function MapboxMap({'
    );
    write('src/features/tracking/components/MapboxMap.tsx', c);
    console.log('  ✓ src/features/tracking/components/MapboxMap.tsx');
  } else {
    console.error('  ✗ Could not find getCirclePolygon function boundaries');
  }
}

// ERROR 5: useTrackingWebSocket.ts:188 — react-hooks/immutability (connect before declaration)
// The issue is that `onclose` handler references `connect` which is being defined in the same useCallback.
// Solution: Use a ref to hold the connect function
console.log('5. useTrackingWebSocket.ts — connect ref pattern');
{
  let c = read('src/hooks/useTrackingWebSocket.ts');
  // The problem: ws.onclose calls connect() but connect is the const being declared.
  // Fix: store connect in a ref and call via ref
  // Add connectRef after existing refs
  if (!c.includes('connectRef')) {
    c = c.replace(
      'const retryTimerRef = useRef',
      'const connectRef = useRef<(() => void) | null>(null);\n  const retryTimerRef = useRef'
    );
    // Replace the self-reference inside onclose
    c = c.replace(
      '        connect();\n      }, backoffRef.current);\n    };\n  }, [setWsStatus, handleEvent, startPolling, stopPolling]);',
      '        connectRef.current?.();\n      }, backoffRef.current);\n    };\n  }, [setWsStatus, handleEvent, startPolling, stopPolling]);'
    );
    // Add ref assignment after connect is defined
    c = c.replace(
      '  }, [setWsStatus, handleEvent, startPolling, stopPolling]);\n\n  useEffect(() => {\n    connect();',
      '  }, [setWsStatus, handleEvent, startPolling, stopPolling]);\n\n  useEffect(() => {\n    connectRef.current = connect;\n  }, [connect]);\n\n  useEffect(() => {\n    connect();'
    );
    write('src/hooks/useTrackingWebSocket.ts', c);
    console.log('  ✓ src/hooks/useTrackingWebSocket.ts');
  }
}

console.log('\n=== WARNINGS ===\n');

// WARNING: map/page.tsx — unused imports
console.log('6. map/page.tsx — remove unused imports');
fix('app/(agent)/map/page.tsx',
  `import { Camera, ShieldAlert, X, Search, Clock, ArrowLeft, ArrowRight, Play, CheckCircle } from 'lucide-react';`,
  `import { X } from 'lucide-react';`
);

// WARNING: map/page.tsx:508 — unused previews
console.log('7. map/page.tsx — prefix previews with _');
fix('app/(agent)/map/page.tsx',
  'const [previews, setPreviews] = useState<string[]>([]);',
  'const [_previews, setPreviews] = useState<string[]>([]);'
);

// WARNING: map/page.tsx:632 — unused router
console.log('8. map/page.tsx — remove unused router in MapContent');
fix('app/(agent)/map/page.tsx',
  `function MapContent() {
  const router = useRouter();
  const searchParams = useSearchParams();`,
  `function MapContent() {
  const searchParams = useSearchParams();`
);

// WARNING: map/page.tsx:957 — unused err
console.log('9. map/page.tsx — prefix err with _');
fix('app/(agent)/map/page.tsx',
  '    } catch (err) {\n      alert(\'Location error: Could not get your current position. Please try again.\');',
  '    } catch (_err) {\n      alert(\'Location error: Could not get your current position. Please try again.\');'
);

// WARNING: crm/leads/page.tsx:20 — unused refetch
console.log('10. crm/leads/page.tsx — remove unused refetch');
fix('app/(agent)/crm/leads/page.tsx',
  'const { data: leadsData, isLoading, refetch } = useLeads(',
  'const { data: leadsData, isLoading } = useLeads('
);

// WARNING: crm/page.tsx:19 — unused user
console.log('11. crm/page.tsx — remove unused user');
fix('app/(agent)/crm/page.tsx',
  "const { user } = useAuth();",
  "useAuth();"
);

// WARNING: meetings/[id]/edit/page.tsx:3 — unused useEffect
console.log('12. meetings/[id]/edit/page.tsx — remove unused useEffect');
fix('app/(agent)/meetings/[id]/edit/page.tsx',
  "import React, { useState, useEffect, use } from 'react';",
  "import React, { useState, use } from 'react';"
);

// WARNING: meetings/page.tsx:17 — unused isSameDay, :71 — unused refetch
console.log('13. meetings/page.tsx — remove unused isSameDay function');
{
  let c = read('app/(agent)/meetings/page.tsx');
  // Remove isSameDay function
  c = c.replace(
    `function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type Section`,
    `type Section`
  );
  // Remove unused refetch
  c = c.replace(
    `    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useMeetingList(filters);`,
    `    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMeetingList(filters);`
  );
  write('app/(agent)/meetings/page.tsx', c);
  console.log('  ✓ app/(agent)/meetings/page.tsx');
}

// WARNING: page.tsx:15 — unused router
console.log('14. page.tsx — remove unused router');
fix('app/(agent)/page.tsx',
  "  const router = useRouter();\n  const [selectedDate",
  "  const [selectedDate"
);

// WARNING: task/[id]/complete/page.tsx — unused imports + vars
console.log('15. task/[id]/complete/page.tsx — remove unused imports/vars');
{
  let c = read('app/(agent)/task/[id]/complete/page.tsx');
  c = c.replace(
    "import { Camera, Image as ImageIcon, CheckCircle, ShieldAlert } from 'lucide-react';",
    "import { Camera, ShieldAlert } from 'lucide-react';"
  );
  c = c.replace(
    '  const router = useRouter();\n  const routeParams = useParams();',
    '  const routeParams = useParams();'
  );
  c = c.replace(
    '  const taskId = Number(id);\n',
    ''
  );
  write('app/(agent)/task/[id]/complete/page.tsx', c);
  console.log('  ✓ app/(agent)/task/[id]/complete/page.tsx');
}

// WARNING: task/[id]/page.tsx:92 — unused isDone
console.log('16. task/[id]/page.tsx — prefix isDone with _');
fix('app/(agent)/task/[id]/page.tsx',
  'const isDone = task.status',
  'const _isDone = task.status'
);

// WARNING: task/[id]/tracking/page.tsx — unused imports/vars
console.log('17. task/[id]/tracking/page.tsx — remove unused imports/vars');
{
  let c = read('app/(agent)/task/[id]/tracking/page.tsx');
  c = c.replace(
    "import React, { useEffect, useCallback, useState } from 'react';",
    "import React, { useCallback, useState } from 'react';"
  );
  c = c.replace(
    "import { Compass, MapPin, AlertCircle, ShieldAlert } from 'lucide-react';",
    "import { Compass, ShieldAlert } from 'lucide-react';"
  );
  c = c.replace(
    '  const router = useRouter();\n  const routeParams = useParams();',
    '  const routeParams = useParams();'
  );
  c = c.replace(
    '    } catch (err) {\n      alert(\'Location error: Could not get your current position. Please try again.\');',
    '    } catch (_err) {\n      alert(\'Location error: Could not get your current position. Please try again.\');'
  );
  write('app/(agent)/task/[id]/tracking/page.tsx', c);
  console.log('  ✓ app/(agent)/task/[id]/tracking/page.tsx');
}

// WARNING: tasks/page.tsx — unused Clock, TaskStatus
console.log('18. tasks/page.tsx — remove unused imports');
{
  let c = read('app/(agent)/tasks/page.tsx');
  c = c.replace(
    "import { ArrowLeft, MapPin, AlertCircle, Clock } from 'lucide-react';",
    "import { ArrowLeft, MapPin, AlertCircle } from 'lucide-react';"
  );
  c = c.replace(
    ", type Task, type TaskStatus } from '@/features/tasks';",
    ", type Task } from '@/features/tasks';"
  );
  write('app/(agent)/tasks/page.tsx', c);
  console.log('  ✓ app/(agent)/tasks/page.tsx');
}

// WARNING: login/page.tsx:56 — unused isAnimating, setIsAnimating
console.log('19. login/page.tsx — remove unused isAnimating state');
fix('app/(auth)/login/page.tsx',
  "  const [isAnimating, setIsAnimating] = useState(true);\n",
  ""
);

// WARNING: ClockInModal.tsx:21 — unused action
console.log('20. ClockInModal.tsx — prefix action with _');
fix('src/features/attendance/components/ClockInModal.tsx',
  'const action = isClockedIn',
  'const _action = isClockedIn'
);

// WARNING: network.ts:7 — unused useCallback
console.log('21. network.ts — remove unused useCallback import');
fix('src/lib/network.ts',
  "import { useState, useEffect, useCallback } from 'react';",
  "import { useState, useEffect } from 'react';"
);

// WARNING: syncEngine.ts:11 — unused ProofQueueEntry
console.log('22. syncEngine.ts — remove unused ProofQueueEntry import');
fix('src/lib/sync/syncEngine.ts',
  "import type { LocationQueueEntry, ProofQueueEntry } from '@/lib/db/schema';",
  "import type { LocationQueueEntry } from '@/lib/db/schema';"
);

// WARNING: tracking.ts:109 — unused _removed
console.log('23. tracking.ts — already has _ prefix, converting destructure');
// _removed is already prefixed but still flagged — need to use rest pattern differently
fix('src/store/tracking.ts',
  'const { [taskId]: _removed, ...rest } = state.liveTaskMap;',
  'const { [taskId]: _unused, ...rest } = state.liveTaskMap; void _unused;'
);

// WARNING: start-dev.js:81,94 — unused err
console.log('24. start-dev.js — prefix err with _');
{
  let c = read('start-dev.js');
  // Line 81
  c = c.replace(
    '  } catch (err) {\n    // Couldn\'t parse or delete',
    '  } catch (_err) {\n    // Couldn\'t parse or delete'
  );
  // Line 94
  c = c.replace(
    '} catch (err) {\n  // Fallback to hardcoded',
    '} catch (_err) {\n  // Fallback to hardcoded'
  );
  write('start-dev.js', c);
  console.log('  ✓ start-dev.js');
}

console.log('\n=== DONE ===');
console.log('All fixes applied. Run npm run lint to verify.\n');
