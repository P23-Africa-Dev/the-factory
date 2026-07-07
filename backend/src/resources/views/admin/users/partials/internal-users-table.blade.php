<div class="metric-card" id="usersTableCard">
    <div class="table-card-header">
        <span class="fw-semibold" style="font-size:.85rem">
            <i class="bi bi-people me-2" style="color:var(--text-muted)"></i>
            {{ $users->total() }} internal user{{ $users->total() !== 1 ? 's' : '' }}
        </span>
        <span style="font-size:.75rem;color:var(--text-muted)">
            Page {{ $users->currentPage() }} of {{ $users->lastPage() }}
        </span>
    </div>

    <div class="table-responsive">
        <table class="table admin-table mb-0">
            <thead>
                <tr>
                    <th style="width:44px">#</th>
                    <th>User</th>
                    <th style="width:100px">Role</th>
                    <th>Supervisor</th>
                    <th>Organization</th>
                    <th>Status</th>
                    <th style="width:110px">Joined</th>
                    <th class="action-col"></th>
                </tr>
            </thead>
            <tbody>
                @forelse ($users as $user)
                    @php
                        $rowNum    = ($users->currentPage() - 1) * $users->perPage() + $loop->iteration;
                        $suspended = $user->suspended_until && $user->suspended_until->isFuture();
                        $company   = $user->companies->first();
                        $roleColor = match($user->internal_role) {
                            'supervisor' => ['bg' => 'rgba(139,92,246,.12)', 'fg' => '#7c3aed'],
                            'agent'      => ['bg' => 'rgba(6,182,212,.12)',  'fg' => '#0891b2'],
                            'manager'    => ['bg' => 'rgba(245,158,11,.12)', 'fg' => '#d97706'],
                            default      => ['bg' => 'rgba(100,116,139,.1)', 'fg' => 'var(--text-muted)'],
                        };
                    @endphp
                    <tr>
                        <td style="color:var(--text-muted);font-size:.75rem;font-weight:600">{{ $rowNum }}</td>

                        <td>
                            <a href="{{ route('admin.users.show', $user) }}" class="text-decoration-none">
                                <div class="fw-semibold" style="font-size:.85rem;color:var(--text-primary)">{{ $user->name }}</div>
                                <div style="font-size:.75rem;color:var(--text-muted)">{{ $user->email }}</div>
                            </a>
                        </td>

                        <td>
                            <span class="badge-status" style="background:{{ $roleColor['bg'] }};color:{{ $roleColor['fg'] }};font-size:.72rem">
                                {{ ucfirst($user->internal_role ?? '') }}
                            </span>
                        </td>

                        <td>
                            @if ($user->supervisor)
                                <a href="{{ route('admin.users.show', $user->supervisor) }}"
                                   class="text-decoration-none" style="font-size:.82rem;color:var(--accent)">
                                    {{ $user->supervisor->name }}
                                </a>
                            @else
                                <span style="color:var(--text-muted);font-size:.78rem">—</span>
                            @endif
                        </td>

                        <td>
                            @if ($company)
                                <span style="font-size:.82rem;color:var(--text-primary)">{{ $company->name }}</span>
                                <div style="font-size:.68rem;color:var(--text-muted);margin-top:1px">{{ $company->company_id }}</div>
                            @else
                                <span style="color:var(--text-muted);font-size:.78rem">—</span>
                            @endif
                        </td>

                        <td>
                            @if ($user->deleted_at)
                                <span class="badge-status" style="background:rgba(220,38,38,.12);color:#dc2626">
                                    <i class="bi bi-trash3"></i>Trashed
                                </span>
                                <div style="font-size:.68rem;margin-top:2px;color:var(--text-muted)">
                                    {{ $user->deleted_at?->diffForHumans() }}
                                </div>
                            @elseif ($suspended)
                                <span class="badge-status badge-suspended">
                                    <i class="bi bi-pause-circle"></i>Suspended
                                </span>
                                <div style="font-size:.68rem;margin-top:2px;color:var(--text-muted)">
                                    until {{ $user->suspended_until->format('M j, Y') }}
                                </div>
                            @elseif ($user->is_active)
                                <span class="badge-status badge-active"><i class="bi bi-check-circle"></i>Active</span>
                            @else
                                <span class="badge-status badge-inactive"><i class="bi bi-x-circle"></i>Inactive</span>
                            @endif
                        </td>

                        <td style="color:var(--text-muted);font-size:.78rem">
                            {{ $user->created_at?->format('M j, Y') }}
                        </td>

                        <td>
                            <div class="dropdown">
                                <button class="btn btn-sm btn-outline-secondary py-1 px-2 dropdown-toggle"
                                        type="button" data-bs-toggle="dropdown" aria-expanded="false">
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end" style="min-width:170px">
                                    <li>
                                        <a class="dropdown-item" href="{{ route('admin.users.show', $user) }}">
                                            <i class="bi bi-eye me-2" style="color:var(--text-muted)"></i>View Details
                                        </a>
                                    </li>
                                    <li><hr class="dropdown-divider my-1"></li>

                                    @if ($user->deleted_at)
                                        <li>
                                            <form method="POST" action="{{ route('admin.users.restore', $user->id) }}">
                                                @csrf
                                                <button class="dropdown-item" style="color:var(--success)" type="submit">
                                                    <i class="bi bi-arrow-counterclockwise me-2"></i>Restore
                                                </button>
                                            </form>
                                        </li>
                                        <li>
                                            <form method="POST" action="{{ route('admin.users.force-destroy', $user->id) }}"
                                                onsubmit="return confirm('PERMANENTLY DELETE this user? This cannot be undone.')">
                                                @csrf @method('DELETE')
                                                <button class="dropdown-item" style="color:var(--danger)" type="submit">
                                                    <i class="bi bi-x-octagon me-2"></i>Delete Permanently
                                                </button>
                                            </form>
                                        </li>
                                    @endif

                                    @if (! $user->deleted_at && $user->is_active && !$suspended)
                                        <li>
                                            <button class="dropdown-item" style="color:var(--warning)"
                                                    data-bs-toggle="modal" data-bs-target="#suspendModal"
                                                    data-user-id="{{ $user->id }}"
                                                    data-user-name="{{ e($user->name) }}">
                                                <i class="bi bi-pause-circle me-2"></i>Suspend
                                            </button>
                                        </li>
                                        <li>
                                            <form method="POST" action="{{ route('admin.users.status.update', $user) }}">
                                                @csrf @method('PATCH')
                                                <input type="hidden" name="is_active" value="0">
                                                <button class="dropdown-item" style="color:var(--text-secondary)" type="submit">
                                                    <i class="bi bi-person-dash me-2"></i>Deactivate
                                                </button>
                                            </form>
                                        </li>
                                    @endif

                                    @if (! $user->deleted_at && (!$user->is_active || $suspended))
                                        <li>
                                            <form method="POST" action="{{ route('admin.users.reactivate', $user) }}">
                                                @csrf
                                                <button class="dropdown-item" style="color:var(--success)" type="submit">
                                                    <i class="bi bi-play-circle me-2"></i>Reactivate
                                                </button>
                                            </form>
                                        </li>
                                    @endif

                                    @if (! $user->deleted_at)
                                        <li><hr class="dropdown-divider my-1"></li>
                                        <li>
                                            <button class="dropdown-item" style="color:var(--danger)"
                                                    data-bs-toggle="modal" data-bs-target="#deleteModal"
                                                    data-user-id="{{ $user->id }}"
                                                    data-user-name="{{ e($user->name) }}">
                                                <i class="bi bi-trash3 me-2"></i>Move to Trash
                                            </button>
                                        </li>
                                    @endif
                                </ul>
                            </div>
                        </td>
                    </tr>
                @empty
                    <tr>
                        <td colspan="8" class="text-center py-5" style="color:var(--text-muted)">
                            <i class="bi bi-people d-block mb-2" style="font-size:2rem;opacity:.25"></i>
                            No internal users found.
                        </td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>

    @if ($users->hasPages())
        <div class="table-card-footer">
            {{ $users->links() }}
        </div>
    @endif
</div>
