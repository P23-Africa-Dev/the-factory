<div class="card border-0 shadow-sm">
    <div class="table-responsive">
        <table class="table table-sm align-middle mb-0">
            <thead>
                <tr>
                    @foreach ($columns as $column)
                        <th class="text-nowrap" style="font-size:.75rem">{{ $column }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @forelse ($rows as $row)
                    <tr>
                        @foreach ($columns as $column)
                            <td style="font-size:.78rem;max-width:280px">{{ $row[$column] ?? '' }}</td>
                        @endforeach
                    </tr>
                @empty
                    <tr>
                        <td colspan="{{ max(1, count($columns)) }}" class="text-muted" style="font-size:.82rem">No records in this range.</td>
                    </tr>
                @endforelse
            </tbody>
        </table>
    </div>
    @if (is_object($rows) && method_exists($rows, 'links'))
        <div class="px-3 py-2">{{ $rows->links() }}</div>
    @endif
</div>
