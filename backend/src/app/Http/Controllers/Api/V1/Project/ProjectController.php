<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1\Project;

use App\Http\Controllers\Concerns\ResolvesCompanyContextId;
use App\Http\Controllers\Controller;
use App\Http\Requests\Project\CreateProjectRequest;
use App\Http\Requests\Project\UpdateProjectRequest;
use App\Http\Resources\ProjectResource;
use App\Models\Project;
use App\Services\Project\ProjectService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProjectController extends Controller
{
    use ResolvesCompanyContextId;

    public function __construct(private readonly ProjectService $projectService) {}

    public function index(Request $request): JsonResponse
    {
        $result = $this->projectService->listForManagerWithAnalytics($request->user(), [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'status' => $request->string('status')->toString(),
            'priority' => $request->string('priority')->toString(),
            'type' => $request->string('type')->toString(),
            'search' => $request->string('search')->toString(),
        ]);

        $projects = $result['projects'];

        return $this->success(
            message: 'Projects fetched successfully.',
            data: [
                'items' => ProjectResource::collection($projects->items()),
                'pagination' => [
                    'next_page_url' => $projects->nextPageUrl(),
                    'prev_page_url' => $projects->previousPageUrl(),
                    'per_page' => $projects->perPage(),
                ],
                'analytics' => $result['analytics'],
            ],
        );
    }

    public function agentIndex(Request $request): JsonResponse
    {
        $result = $this->projectService->listForAgentWithAnalytics($request->user(), [
            'company_id' => $this->resolveCompanyContextId($request->input('company_id')),
            'status' => $request->string('status')->toString(),
            'priority' => $request->string('priority')->toString(),
            'type' => $request->string('type')->toString(),
            'search' => $request->string('search')->toString(),
        ]);

        $projects = $result['projects'];

        return $this->success(
            message: 'Projects fetched successfully.',
            data: [
                'items' => ProjectResource::collection($projects->items()),
                'pagination' => [
                    'next_page_url' => $projects->nextPageUrl(),
                    'prev_page_url' => $projects->previousPageUrl(),
                    'per_page' => $projects->perPage(),
                ],
                'analytics' => $result['analytics'],
            ],
        );
    }

    public function store(CreateProjectRequest $request): JsonResponse
    {
        $project = $this->projectService->create($request->user(), $request->validated());

        return $this->success(
            message: 'Project created successfully.',
            data: ['project' => new ProjectResource($project)],
            status: 201,
        );
    }

    public function show(Request $request, Project $project): JsonResponse
    {
        $project = $this->projectService->findForManager(
            $request->user(),
            $project,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Project fetched successfully.',
            data: ['project' => new ProjectResource($project)],
        );
    }

    public function agentShow(Request $request, Project $project): JsonResponse
    {
        $project = $this->projectService->findForAgent(
            $request->user(),
            $project,
            $this->resolveCompanyContextId($request->input('company_id')),
        );

        return $this->success(
            message: 'Project fetched successfully.',
            data: ['project' => new ProjectResource($project)],
        );
    }

    public function update(UpdateProjectRequest $request, Project $project): JsonResponse
    {
        $project = $this->projectService->update($request->user(), $project, $request->validated());

        return $this->success(
            message: 'Project updated successfully.',
            data: ['project' => new ProjectResource($project)],
        );
    }
}
