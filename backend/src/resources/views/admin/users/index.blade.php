@extends('layouts.admin')

@section('title', 'User Management')
@section('page-title', 'Users')

@section('breadcrumb')
    <li class="breadcrumb-item active">Users</li>
@endsection

@section('content')

{{-- ── Tab Navigation ──────────────────────────────────── --}}
<div class="metric-card mb-3 p-0 overflow-hidden">
    <div class="d-flex align-items-stretch border-bottom" style="border-color:var(--border)!important">
        <a href="{{ route('admin.users.index', ['tab' => 'owners']) }}"
           class="tab-link d-flex align-items-center gap-2 px-4 py-3 text-decoration-none border-end {{ $tab === 'owners' ? 'tab-link-active' : '' }}"
           style="border-color:var(--border)!important;font-size:.85rem;font-weight:600">
            <i class="bi bi-person-check" style="font-size:1rem"></i>
            Account Owners
            <span class="badge rounded-pill ms-1"
                  style="background:{{ $tab === 'owners' ? 'var(--accent)' : '#e2e8f0' }};
                         color:{{ $tab === 'owners' ? '#fff' : 'var(--text-muted)' }};
                         font-size:.7rem;padding:.25em .6em">{{ $ownerCount }}</span>
        </a>
        <a href="{{ route('admin.users.index', ['tab' => 'internal']) }}"
           class="tab-link d-flex align-items-center gap-2 px-4 py-3 text-decoration-none {{ $tab === 'internal' ? 'tab-link-active' : '' }}"
           style="font-size:.85rem;font-weight:600">
            <i class="bi bi-people" style="font-size:1rem"></i>
            Internal Users
            <span class="badge rounded-pill ms-1"
                  style="background:{{ $tab === 'internal' ? 'var(--accent)' : '#e2e8f0' }};
                         color:{{ $tab === 'internal' ? '#fff' : 'var(--text-muted)' }};
                         font-size:.7rem;padding:.25em .6em">{{ $internalCount }}</span>
        </a>
        <div class="ms-auto d-flex align-items-center pe-3" style="font-size:.75rem;color:var(--text-muted)">
            @if ($tab === 'owners')
                <i class="bi bi-info-circle me-1"></i>Self-serve &amp; enterprise account holders
            @else
                <i class="bi bi-info-circle me-1"></i>Supervisors &amp; agents created within accounts
            @endif
        </div>
    </div>
</div>

{{-- ── Filter Bar ──────────────────────────────────────── --}}
<div class="filter-bar">
    <form method="GET" id="usersFilterForm" class="row g-2 align-items-end">
        <input type="hidden" name="tab" value="{{ $tab }}">

        <div class="col-md-4">
            <label class="form-label small fw-semibold mb-1" style="color:var(--text-secondary);font-size:.75rem">Search</label>
            <div class="input-group">
                <span class="input-group-text"><i class="bi bi-search" style="font-size:.8rem;color:var(--text-muted)"></i></span>
                <input type="text" id="usersSearchInput" name="search"
                       value="{{ $filters['search'] ?? '' }}"
                       class="form-control" placeholder="Name or email…">
            </div>
        </div>

        @if ($tab === 'owners')
        <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1" style="color:var(--text-secondary);font-size:.75rem">Account Type</label>
            <select id="usersAccountTypeSelect" name="account_type" class="form-select">
                <option value="">All types</option>
                <option value="self_serve" @selected(($filters['account_type'] ?? '') === 'self_serve')>Self-Serve</option>
                <option value="enterprise" @selected(($filters['account_type'] ?? '') === 'enterprise')>Enterprise</option>
            </select>
        </div>
        @else
        <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1" style="color:var(--text-secondary);font-size:.75rem">Role</label>
            <select id="usersRoleSelect" name="role" class="form-select">
                <option value="">All roles</option>
                <option value="supervisor" @selected(($filters['role'] ?? '') === 'supervisor')>Supervisor</option>
                <option value="agent"      @selected(($filters['role'] ?? '') === 'agent')>Agent</option>
                <option value="manager"    @selected(($filters['role'] ?? '') === 'manager')>Manager</option>
            </select>
        </div>
        @endif

        <div class="col-md-2">
            <label class="form-label small fw-semibold mb-1" style="color:var(--text-secondary);font-size:.75rem">Status</label>
            <select id="usersStatusSelect" name="status" class="form-select">
                <option value="">All statuses</option>
                <option value="active"    @selected(($filters['status'] ?? '') === 'active')>Active</option>
                <option value="suspended" @selected(($filters['status'] ?? '') === 'suspended')>Suspended</option>
                <option value="inactive"  @selected(($filters['status'] ?? '') === 'inactive')>Inactive</option>
            </select>
        </div>

        <div class="col-md-2">
            <button type="button" id="usersClearFilters" class="btn btn-outline-secondary w-100">
                <i class="bi bi-x-lg me-1"></i>Clear
            </button>
        </div>
        <div class="col-md-2 d-flex align-items-center">
            <div id="usersLoadingState" class="d-none" style="font-size:.78rem;color:var(--text-muted)">
                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Filtering…
            </div>
        </div>
    </form>
</div>

{{-- ── Results ─────────────────────────────────────────── --}}
<div id="usersResults">
    @if ($tab === 'internal')
        @include('admin.users.partials.internal-users-table', ['users' => $users])
    @else
        @include('admin.users.partials.account-owners-table', ['users' => $users])
    @endif
</div>

{{-- ── Suspend Modal ───────────────────────────────────── --}}
<div class="modal fade" id="suspendModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" style="font-size:.95rem">
                    <i class="bi bi-pause-circle me-2" style="color:var(--warning)"></i>Suspend User
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST" id="suspendForm">
                @csrf
                <input type="hidden" name="suspend_type" id="suspendType" value="duration">
                <input type="hidden" name="suspend_days" id="suspendDays" value="3">
                <div class="modal-body">
                    <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-3">
                        Suspending <strong id="suspendUserName"></strong>. Choose a duration:
                    </p>
                    <div class="d-flex flex-wrap gap-2 mb-3">
                        <button type="button" class="btn btn-outline-secondary btn-sm active duration-btn" data-days="3">3 Days</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm duration-btn" data-days="7">7 Days</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm duration-btn" data-days="30">30 Days</button>
                        <button type="button" class="btn btn-outline-secondary btn-sm" id="customDateBtn">Custom Date</button>
                        <button type="button" class="btn btn-outline-danger btn-sm" id="permanentSuspendBtn">Permanent</button>
                    </div>
                    <div id="customDateWrap" class="d-none">
                        <label class="form-label small fw-semibold" style="font-size:.78rem">Suspend Until</label>
                        <input type="date" name="suspend_until" id="suspendUntilDate"
                               class="form-control form-control-sm"
                               min="{{ now()->addDay()->toDateString() }}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-warning btn-sm">
                        <i class="bi bi-pause-circle me-1"></i>Suspend User
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

{{-- ── Delete Modal ────────────────────────────────────── --}}
<div class="modal fade" id="deleteModal" tabindex="-1">
    <div class="modal-dialog modal-sm">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" style="font-size:.95rem">
                    <i class="bi bi-trash3 me-2" style="color:var(--danger)"></i>Delete User
                </h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST" id="deleteForm">
                @csrf
                @method('DELETE')
                <div class="modal-body">
                    <p style="font-size:.85rem;color:var(--text-secondary)" class="mb-0">
                        Are you sure you want to delete <strong id="deleteUserName"></strong>?
                        This will soft-delete the account.
                    </p>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-danger btn-sm">
                        <i class="bi bi-trash3 me-1"></i>Delete
                    </button>
                </div>
            </form>
        </div>
    </div>
</div>

@endsection

@push('styles')
<style>
.tab-link { color: var(--text-secondary); }
.tab-link:hover { background: rgba(0,0,0,.03); color: var(--text-primary); }
.tab-link-active {
    color: var(--accent) !important;
    background: rgba(99,102,241,.04);
    box-shadow: inset 0 -2px 0 var(--accent);
}
</style>
@endpush

@push('scripts')
<script>
document.addEventListener('DOMContentLoaded', function () {
    const filterForm        = document.getElementById('usersFilterForm');
    const searchInput       = document.getElementById('usersSearchInput');
    const statusSelect      = document.getElementById('usersStatusSelect');
    const accountTypeSelect = document.getElementById('usersAccountTypeSelect');
    const roleSelect        = document.getElementById('usersRoleSelect');
    const clearBtn          = document.getElementById('usersClearFilters');
    const loadingState      = document.getElementById('usersLoadingState');
    const resultsWrap       = document.getElementById('usersResults');
    const usersIndexUrl     = @json(route('admin.users.index'));
    const activeTab         = @json($tab);

    let activeController = null;
    let debounceTimer    = null;

    function setLoading(on) {
        loadingState?.classList.toggle('d-none', !on);
    }

    function currentParams() {
        const params = new URLSearchParams();
        params.set('tab', activeTab);

        const search = (searchInput?.value || '').trim();
        if (search)  params.set('search', search);

        const status = statusSelect?.value || '';
        if (status)  params.set('status', status);

        const accountType = accountTypeSelect?.value || '';
        if (accountType) params.set('account_type', accountType);

        const role = roleSelect?.value || '';
        if (role)    params.set('role', role);

        return params;
    }

    async function loadUsers(params) {
        if (!resultsWrap) return;
        if (activeController) activeController.abort();

        activeController = new AbortController();
        setLoading(true);

        try {
            const query = params.toString();
            const url   = usersIndexUrl + (query ? '?' + query : '');

            const res = await fetch(url, {
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                signal: activeController.signal,
            });

            if (!res.ok) throw new Error('bad response');
            const payload = await res.json();
            if (typeof payload.html !== 'string') throw new Error('bad payload');

            resultsWrap.innerHTML = payload.html;
            window.history.replaceState({}, '', url);
        } catch (err) {
            if (err.name !== 'AbortError') {
                window.location.href = usersIndexUrl + (currentParams().toString() ? '?' + currentParams().toString() : '');
            }
        } finally {
            setLoading(false);
        }
    }

    function debouncedLoad() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const p = currentParams(); p.delete('page'); loadUsers(p);
        }, 350);
    }

    if (filterForm) {
        filterForm.addEventListener('submit', e => { e.preventDefault(); const p = currentParams(); p.delete('page'); loadUsers(p); });
        searchInput?.addEventListener('input', debouncedLoad);
        statusSelect?.addEventListener('change', () => { const p = currentParams(); p.delete('page'); loadUsers(p); });
        accountTypeSelect?.addEventListener('change', () => { const p = currentParams(); p.delete('page'); loadUsers(p); });
        roleSelect?.addEventListener('change', () => { const p = currentParams(); p.delete('page'); loadUsers(p); });
        clearBtn?.addEventListener('click', () => {
            if (searchInput)       searchInput.value       = '';
            if (statusSelect)      statusSelect.value      = '';
            if (accountTypeSelect) accountTypeSelect.value = '';
            if (roleSelect)        roleSelect.value        = '';
            const p = new URLSearchParams(); p.set('tab', activeTab);
            loadUsers(p);
        });
    }

    resultsWrap?.addEventListener('click', e => {
        const link = e.target.closest('.pagination a');
        if (!link) return;
        e.preventDefault();
        const u = new URL(link.href);
        const p = currentParams();
        const page = u.searchParams.get('page');
        if (page) p.set('page', page);
        loadUsers(p);
    });

    /* Suspend modal */
    const suspendModal = document.getElementById('suspendModal');
    if (suspendModal) {
        suspendModal.addEventListener('show.bs.modal', e => {
            const btn = e.relatedTarget;
            document.getElementById('suspendUserName').textContent = btn.dataset.userName;
            document.getElementById('suspendForm').action = '/admin/users/' + btn.dataset.userId + '/suspend';
            document.getElementById('suspendType').value = 'duration';
            document.getElementById('suspendDays').value = '3';
            document.getElementById('customDateWrap').classList.add('d-none');
            document.querySelectorAll('.duration-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.duration-btn[data-days="3"]').classList.add('active');
            document.getElementById('customDateBtn').classList.remove('active');
            document.getElementById('permanentSuspendBtn')?.classList.remove('active');
        });
        document.querySelectorAll('.duration-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                document.querySelectorAll('.duration-btn, #customDateBtn, #permanentSuspendBtn').forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                document.getElementById('suspendType').value = 'duration';
                document.getElementById('suspendDays').value = this.dataset.days;
                document.getElementById('customDateWrap').classList.add('d-none');
            });
        });
        document.getElementById('customDateBtn')?.addEventListener('click', function () {
            document.querySelectorAll('.duration-btn, #customDateBtn, #permanentSuspendBtn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('suspendType').value = 'date';
            document.getElementById('customDateWrap').classList.remove('d-none');
        });
        document.getElementById('permanentSuspendBtn')?.addEventListener('click', function () {
            document.querySelectorAll('.duration-btn, #customDateBtn, #permanentSuspendBtn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('suspendType').value = 'permanent';
            document.getElementById('customDateWrap').classList.add('d-none');
        });
    }

    document.getElementById('deleteModal')?.addEventListener('show.bs.modal', e => {
        const btn = e.relatedTarget;
        document.getElementById('deleteUserName').textContent = btn.dataset.userName;
        document.getElementById('deleteForm').action = '/admin/users/' + btn.dataset.userId;
    });
});
</script>
@endpush
