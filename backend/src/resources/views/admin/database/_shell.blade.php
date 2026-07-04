{{-- Reusable sensitive-environment banner shown on every database manager page --}}
<div class="metric-card p-3 mb-3" style="border-left: 4px solid var(--danger, #dc2626); background: rgba(220,38,38,0.04)">
    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
        <div class="d-flex align-items-center gap-2">
            <i class="bi bi-shield-exclamation" style="font-size:1.1rem;color:var(--danger, #dc2626)"></i>
            <div>
                <strong style="font-size:.85rem;color:var(--danger, #dc2626)">Sensitive Environment - Manage Database</strong>
                <div style="font-size:.72rem;color:var(--text-muted)">
                    Every action here is audit logged. Sensitive tables are marked in red.
                </div>
            </div>
        </div>
        <div class="d-flex align-items-center gap-2">
            <form method="POST" action="{{ route('admin.database.lock') }}" class="mb-0">
                @csrf
                <button type="submit" class="btn btn-sm btn-outline-danger">
                    <i class="bi bi-lock me-1"></i>Lock
                </button>
            </form>
        </div>
    </div>
</div>
