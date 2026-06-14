<template>
  <div class="ig-landing">
    <div class="ig-glow" aria-hidden="true" />

    <!-- ── Hero (split: copy left, code window right) ──────────────────── -->
    <div class="ig-wrap">
      <section class="ig-hero">
        <div class="ig-hero__copy">
          <div class="ig-eyebrow">
            <span class="ig-eyebrow__dot" />TypeScript · Hono · Drizzle · Bun
          </div>
          <h1>Enterprise APIs<br />at <span class="ig-gtext">Hono speed</span></h1>
          <p class="ig-lede">
            LoopBack&nbsp;4's architecture with Hono's raw throughput.
            <b>Dependency injection, repositories, auth and real-time</b>
            - batteries included, none of the overhead.
          </p>
          <div class="ig-cta">
            <a href="/guides/get-started/5-minute-quickstart" class="ig-btn ig-btn--primary">Get Started &#x2192;</a>
            <a href="https://github.com/VENIZIA-AI/ignis" class="ig-btn ig-btn--secondary">&#x2605; Star on GitHub</a>
          </div>
          <div class="ig-stats">
            <div class="ig-stat">
              <div class="ig-stat__n ig-gtext">~140k</div>
              <div class="ig-stat__l">req / sec</div>
            </div>
            <div class="ig-stat">
              <div class="ig-stat__n ig-gtext">~350</div>
              <div class="ig-stat__l">LoC DI core</div>
            </div>
            <div class="ig-stat">
              <div class="ig-stat__n ig-gtext">100%</div>
              <div class="ig-stat__l">type-safe</div>
            </div>
          </div>
        </div>

        <div class="ig-code-win">
          <div class="ig-code-win__bar">
            <span class="ig-code-win__dot" style="background:var(--ig-rose)" />
            <span class="ig-code-win__dot" style="background:var(--ig-gold)" />
            <span class="ig-code-win__dot" style="background:var(--ig-coral)" />
            <span class="ig-code-win__filename">user.controller.ts</span>
            <span class="ig-code-win__tag">live</span>
          </div>
          <!-- v-pre: skip Vue template compilation inside the code sample -->
          <pre v-pre><span class="ig-k">import</span> { controller, get, BaseRestController } <span class="ig-k">from</span> <span class="ig-s">'@venizia/ignis'</span>

<span class="ig-d">@controller</span>({ <span class="ig-p">path</span>: <span class="ig-s">'/users'</span> })
<span class="ig-k">export class</span> <span class="ig-c">UserController</span> <span class="ig-k">extends</span> <span class="ig-c">BaseRestController</span> {
  <span class="ig-d">@get</span>({ <span class="ig-p">path</span>: <span class="ig-s">'/:id'</span> })
  <span class="ig-k">async</span> <span class="ig-d">findById</span>({ id }: { id: <span class="ig-c">string</span> }) {
    <span class="ig-k">return this</span>.userRepo.<span class="ig-d">findById</span>({ id })
  }
}</pre>
        </div>
      </section>
    </div>

    <!-- ── 6 feature cards ──────────────────────────────────────────────── -->
    <div class="ig-divider" />
    <div class="ig-wrap">
      <section class="ig-section">
        <div class="ig-section-head">
          <div class="ig-label">Everything you need</div>
          <h2>Enterprise structure,<br />without the ceremony</h2>
          <p>The patterns that scale teams - wired into a framework that doesn't slow down.</p>
        </div>
        <div class="ig-features">
          <div class="ig-fcard">
            <div class="ig-fcard__icon">
              <!-- bolt / performance -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <h3>~140k req/s</h3>
            <p>Direct Hono integration with zero wrapping overhead. Singleton datasources, SQL-level field hiding, lazy metadata.</p>
          </div>
          <div class="ig-fcard">
            <div class="ig-fcard__icon">
              <!-- hexagon / DI container -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            </div>
            <h3>Decorator DI</h3>
            <p>A ~350-LoC IoC container. <code>@inject</code>, <code>@controller</code>, <code>@repository</code> with auto-wiring and singleton/transient scopes.</p>
          </div>
          <div class="ig-fcard">
            <div class="ig-fcard__icon">
              <!-- database / type-safe data -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <ellipse cx="12" cy="5" rx="9" ry="3"/>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
              </svg>
            </div>
            <h3>Type-safe data</h3>
            <p>Drizzle + Zod end-to-end. Repository hierarchy with relations, transactions, soft-delete and a rich filter system.</p>
          </div>
          <div class="ig-fcard">
            <div class="ig-fcard__icon">
              <!-- shield / auth -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </div>
            <h3>Auth, built in</h3>
            <p>JWT / JWKS / Basic strategies and Casbin scoped-RBAC authorization - as composable components.</p>
          </div>
          <div class="ig-fcard">
            <div class="ig-fcard__icon">
              <!-- arrows / real-time -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="17 1 21 5 17 9"/>
                <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
                <polyline points="7 23 3 19 7 15"/>
                <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
              </svg>
            </div>
            <h3>Real-time &amp; jobs</h3>
            <p>WebSocket, Socket.IO, BullMQ queues, Kafka, Redis, Cron and Mail - first-class helpers, ready to wire.</p>
          </div>
          <div class="ig-fcard">
            <div class="ig-fcard__icon">
              <!-- book-open / OpenAPI -->
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
              </svg>
            </div>
            <h3>Auto OpenAPI</h3>
            <p>Routes are typed with <code>@hono/zod-openapi</code>; Swagger / Scalar docs generated from your schemas.</p>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Performance band (horizontal bar chart) ──────────────────────── -->
    <div class="ig-divider" />
    <div class="ig-wrap">
      <div class="ig-perf">
        <div class="ig-perf__copy">
          <div class="ig-label">Performance</div>
          <h2>Architecture has a<br />speed limit. IGNIS<br />doesn't hit it.</h2>
          <p>Built directly on Hono, IGNIS keeps near-bare-metal throughput while giving you the structure heavier frameworks charge a tax for.</p>
          <p class="ig-fine">Illustrative req/s, single instance. Your numbers depend on workload.</p>
        </div>
        <div class="ig-bars">
          <div class="ig-bar-row">
            <div class="ig-bar-row__name">Hono</div>
            <div class="ig-track"><div class="ig-fill ig-fill--muted" style="width:97%">~150k</div></div>
          </div>
          <div class="ig-bar-row ig-bar-row--hl">
            <div class="ig-bar-row__name">IGNIS</div>
            <div class="ig-track"><div class="ig-fill ig-fill--ig" style="width:92%">~140k</div></div>
          </div>
          <div class="ig-bar-row">
            <div class="ig-bar-row__name">Fastify</div>
            <div class="ig-track"><div class="ig-fill ig-fill--muted" style="width:50%">~75k</div></div>
          </div>
          <div class="ig-bar-row">
            <div class="ig-bar-row__name">NestJS</div>
            <div class="ig-track"><div class="ig-fill ig-fill--muted" style="width:18%">~25k</div></div>
          </div>
          <div class="ig-bar-row">
            <div class="ig-bar-row__name">Express</div>
            <div class="ig-track"><div class="ig-fill ig-fill--muted" style="width:11%">~15k</div></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Honest-fit positioning ────────────────────────────────────────── -->
    <div class="ig-divider" />
    <div class="ig-wrap">
      <section class="ig-section">
        <div class="ig-section-head">
          <div class="ig-label">Is it for you?</div>
          <h2>Honest about the fit</h2>
        </div>
        <div class="ig-pos-grid">
          <div class="ig-pcard ig-pcard--good">
            <h3>&#x2736; Perfect for</h3>
            <ul>
              <li><span class="ig-ic" style="color:var(--ig-gold)">&#x2713;</span> Growing APIs (10+ endpoints) that need real structure</li>
              <li><span class="ig-ic" style="color:var(--ig-gold)">&#x2713;</span> Teams who want DI, repositories and testability</li>
              <li><span class="ig-ic" style="color:var(--ig-gold)">&#x2713;</span> Performance-sensitive services on Bun or Node</li>
              <li><span class="ig-ic" style="color:var(--ig-gold)">&#x2713;</span> Postgres + Drizzle, type-safe top to bottom</li>
            </ul>
          </div>
          <div class="ig-pcard ig-pcard--alt">
            <h3>&#x25CB; Consider alternatives</h3>
            <ul>
              <li><span class="ig-ic" style="color:var(--ig-text-3)">&#x2192;</span> A 3-route microservice - plain Hono</li>
              <li><span class="ig-ic" style="color:var(--ig-text-3)">&#x2192;</span> Heavy GraphQL-first stack - other tools</li>
              <li><span class="ig-ic" style="color:var(--ig-text-3)">&#x2192;</span> Non-Postgres / non-Drizzle requirement</li>
              <li><span class="ig-ic" style="color:var(--ig-text-3)">&#x2192;</span> You want a massive plugin marketplace today</li>
            </ul>
          </div>
        </div>
      </section>
    </div>

    <!-- ── Powered-by chips + footer CTA ────────────────────────────────── -->
    <div class="ig-divider" />
    <div class="ig-wrap">
      <section class="ig-section ig-powered">
        <div class="ig-section-head ig-powered__head">
          <div class="ig-label">Built on giants</div>
          <h2>Powered by the best of the ecosystem</h2>
        </div>
        <div class="ig-chips">
          <div class="ig-chip"><b>Hono</b> · HTTP</div>
          <div class="ig-chip"><b>Drizzle</b> · ORM</div>
          <div class="ig-chip"><b>Zod</b> · Validation</div>
          <div class="ig-chip"><b>TypeScript</b></div>
          <div class="ig-chip"><b>Bun</b> + Node</div>
        </div>
        <p class="ig-powered__footnote">Inspired by Spring Boot and LoopBack 4 - reimagined for the modern TypeScript runtime.</p>
      </section>

      <section class="ig-footer-cta">
        <h2>Build something that <span class="ig-gtext">scales</span>.</h2>
        <p>From first endpoint to production in minutes. No ceremony, no performance tax.</p>
        <div class="ig-cta">
          <a href="/guides/get-started/5-minute-quickstart" class="ig-btn ig-btn--primary">5-Minute Quickstart &#x2192;</a>
          <a href="/guides/" class="ig-btn ig-btn--secondary">Read the Docs</a>
        </div>
      </section>
    </div>
  </div>
</template>
