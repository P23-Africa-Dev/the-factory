<?php

declare(strict_types=1);

namespace App\Services\AI\Agent\Help;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

/**
 * In-app help articles that ground ELY's how-to answers.
 *
 * Articles are Markdown files in resources/ely-help with front matter:
 * title, module, roles, routes, keywords, tools. Search is keyword scoring
 * (title and keywords weigh most), filtered by role and boosted for the page
 * the user is on. There are few articles, so no index table is needed; if the
 * set grows large this can move to a FULLTEXT table behind the same methods.
 */
class HelpLibrary
{
    private const CACHE_KEY = 'ely:help:articles:v1';

    /**
     * @return array<string, array{slug: string, title: string, module: string, roles: array<int, string>, routes: array<int, string>, keywords: array<int, string>, tools: array<int, string>, body: string}>
     */
    public function articles(): array
    {
        $loader = fn (): array => $this->load();

        if (app()->environment('local', 'testing')) {
            return $loader();
        }

        return Cache::remember(self::CACHE_KEY.':'.$this->fingerprint(), 3600, $loader);
    }

    /**
     * @return array<int, array{slug: string, title: string, snippet: string, score: int}>
     */
    public function search(string $query, string $role, ?string $pagePath = null, int $limit = 3): array
    {
        $terms = $this->terms($query);
        if ($terms === []) {
            return [];
        }

        $results = [];
        foreach ($this->articles() as $article) {
            if ($article['roles'] !== [] && ! in_array($role, $article['roles'], true)) {
                continue;
            }

            $title = Str::lower($article['title']);
            $keywords = Str::lower(implode(' ', $article['keywords']));
            $body = Str::lower($article['body']);

            $score = 0;
            foreach ($terms as $term) {
                $score += substr_count($title, $term) * 5;
                $score += substr_count($keywords, $term) * 4;
                $score += min(3, substr_count($body, $term));
            }

            if ($score === 0) {
                continue;
            }

            if ($pagePath !== null && $pagePath !== '') {
                foreach ($article['routes'] as $route) {
                    if ($route !== '' && str_starts_with($pagePath, $route)) {
                        $score += 3;
                        break;
                    }
                }
            }

            $results[] = [
                'slug' => $article['slug'],
                'title' => $article['title'],
                'snippet' => Str::limit($article['body'], 1200),
                'score' => $score,
            ];
        }

        usort($results, static fn (array $a, array $b): int => $b['score'] <=> $a['score']);

        return array_slice($results, 0, max(1, $limit));
    }

    /**
     * @return array{slug: string, title: string, module: string, roles: array<int, string>, routes: array<int, string>, keywords: array<int, string>, tools: array<int, string>, body: string}|null
     */
    public function get(string $slug): ?array
    {
        return $this->articles()[$slug] ?? null;
    }

    /**
     * Tool names mentioned by at least one article (used to check coverage).
     *
     * @return array<int, string>
     */
    public function documentedTools(): array
    {
        $tools = [];
        foreach ($this->articles() as $article) {
            $tools = [...$tools, ...$article['tools']];
        }

        return array_values(array_unique($tools));
    }

    /**
     * @return array<int, string>
     */
    private function terms(string $query): array
    {
        $stop = ['the', 'a', 'an', 'to', 'how', 'do', 'i', 'can', 'my', 'in', 'on', 'of', 'for', 'and', 'or', 'is', 'what', 'where', 'please', 'me', 'it', 'with', 'from', 'this'];

        return array_values(array_unique(array_filter(
            preg_split('/[^\p{L}\p{N}]+/u', Str::lower($query)) ?: [],
            static fn (string $term): bool => mb_strlen($term) >= 3 && ! in_array($term, $stop, true),
        )));
    }

    /**
     * @return array<string, array{slug: string, title: string, module: string, roles: array<int, string>, routes: array<int, string>, keywords: array<int, string>, tools: array<int, string>, body: string}>
     */
    private function load(): array
    {
        $articles = [];
        foreach (File::glob($this->directory().'/*.md') ?: [] as $path) {
            $raw = (string) File::get($path);
            $slug = pathinfo($path, PATHINFO_FILENAME);
            $meta = [];
            $body = $raw;

            if (preg_match('/^---\s*\R(.*?)\R---\s*\R(.*)$/s', $raw, $m) === 1) {
                foreach (preg_split('/\R/', $m[1]) ?: [] as $line) {
                    if (str_contains($line, ':')) {
                        [$key, $value] = array_map('trim', explode(':', $line, 2));
                        $meta[$key] = $value;
                    }
                }
                $body = trim($m[2]);
            }

            $list = static fn (string $key): array => array_values(array_filter(array_map('trim', explode(',', (string) ($meta[$key] ?? '')))));

            $articles[$slug] = [
                'slug' => $slug,
                'title' => (string) ($meta['title'] ?? $slug),
                'module' => (string) ($meta['module'] ?? ''),
                'roles' => $list('roles'),
                'routes' => $list('routes'),
                'keywords' => $list('keywords'),
                'tools' => $list('tools'),
                'body' => $body,
            ];
        }

        return $articles;
    }

    private function directory(): string
    {
        return resource_path('ely-help');
    }

    private function fingerprint(): string
    {
        $parts = [];
        foreach (File::glob($this->directory().'/*.md') ?: [] as $path) {
            $parts[] = basename($path).':'.File::lastModified($path);
        }

        return md5(implode('|', $parts));
    }
}
