<form method="get" action="{{ $action }}" class="card border-0 shadow-sm mb-4">
    <div class="card-body">
        <div class="row g-3 align-items-end">
            <div class="col-sm-6 col-lg-3">
                <label class="form-label small mb-1" for="from">From</label>
                <input type="date" class="form-control form-control-sm" id="from" name="from" value="{{ $filters->from->toDateString() }}" required>
            </div>
            <div class="col-sm-6 col-lg-3">
                <label class="form-label small mb-1" for="to">To</label>
                <input type="date" class="form-control form-control-sm" id="to" name="to" value="{{ $filters->to->toDateString() }}" required>
            </div>
            <div class="col-sm-6 col-lg-3">
                <label class="form-label small mb-1" for="company_id">Company</label>
                <select class="form-select form-select-sm" id="company_id" name="company_id">
                    <option value="">All companies</option>
                    @foreach ($companies as $company)
                        <option value="{{ $company->id }}" @selected($filters->companyId === (int) $company->id)>
                            {{ $company->name }}
                        </option>
                    @endforeach
                </select>
            </div>
            <div class="col-sm-6 col-lg-3">
                <label class="form-label small mb-1" for="person">Person</label>
                <input type="text" class="form-control form-control-sm" id="person" name="person" value="{{ $filters->person }}" placeholder="Name or email" maxlength="255">
            </div>
            @if (! empty($slices))
                <div class="col-sm-6 col-lg-3">
                    <label class="form-label small mb-1" for="slice">Record type</label>
                    <select class="form-select form-select-sm" id="slice" name="slice">
                        @foreach ($slices as $value => $label)
                            <option value="{{ $value }}" @selected($filters->slice === $value)>{{ $label }}</option>
                        @endforeach
                    </select>
                </div>
            @endif
            @if (! empty($userId))
                <input type="hidden" name="user_id" value="{{ $userId }}">
            @endif
            <div class="col-sm-6 col-lg-3">
                <button type="submit" class="btn btn-primary btn-sm">Apply</button>
            </div>
        </div>
    </div>
</form>
