<form method="post" action="{{ $action }}" class="card border-0 shadow-sm mb-4">
    @csrf
    <div class="card-body">
        <h6 class="fw-semibold mb-2">Export this range</h6>
        <p class="mb-3" style="font-size:.8rem;color:var(--text-secondary)">
            A release note is required. The export is saved in the disclosure register with your name, the time, and the filters used.
        </p>
        <input type="hidden" name="from" value="{{ $filters->from->toDateString() }}">
        <input type="hidden" name="to" value="{{ $filters->to->toDateString() }}">
        <input type="hidden" name="company_id" value="{{ $filters->companyId }}">
        <input type="hidden" name="person" value="{{ $filters->person }}">
        <input type="hidden" name="slice" value="{{ $filters->slice }}">
        @if (! empty($userId))
            <input type="hidden" name="user_id" value="{{ $userId }}">
        @endif
        <div class="row g-3 align-items-end">
            <div class="col-md-4">
                <label class="form-label small mb-1" for="requester_type_{{ $formId }}">Who asked</label>
                <select class="form-select form-select-sm" id="requester_type_{{ $formId }}" name="requester_type" required>
                    <option value="">Select</option>
                    @foreach ($requesterTypes as $type)
                        <option value="{{ $type }}" @selected(old('requester_type') === $type)>
                            {{ ucwords(str_replace('_', ' ', $type)) }}
                        </option>
                    @endforeach
                </select>
            </div>
            <div class="col-md-4">
                <label class="form-label small mb-1" for="reference_{{ $formId }}">Reference</label>
                <input type="text" class="form-control form-control-sm" id="reference_{{ $formId }}" name="reference" value="{{ old('reference') }}" maxlength="191" placeholder="Case or ticket number">
            </div>
            <div class="col-md-8">
                <label class="form-label small mb-1" for="note_{{ $formId }}">Release note</label>
                <input type="text" class="form-control form-control-sm" id="note_{{ $formId }}" name="note" value="{{ old('note') }}" required minlength="3" maxlength="2000" placeholder="Why this record is being released">
            </div>
            <div class="col-md-4">
                <button type="submit" class="btn btn-outline-primary btn-sm">Export CSV</button>
            </div>
        </div>
    </div>
</form>
