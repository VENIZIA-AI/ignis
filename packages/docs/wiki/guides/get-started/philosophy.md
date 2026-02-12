# Philosophy: The Best of Two Worlds

Ignis combines the structured, enterprise-grade development experience of **LoopBack 4** with the speed and simplicity of **Hono**.

<div class="philosophy-hero">
<div class="hero-content">
<div class="hero-text">
<strong>Enterprise patterns. Hono performance. Modern simplicity.</strong>
<span>The framework for developers who want structure without the weight.</span>
</div>
</div>
</div>

## The Framework Landscape

When building REST APIs with Node.js/Bun, developers choose from three categories of frameworks:

<div class="landscape-grid">

<div class="landscape-card minimal">
<div class="card-header">
<h3>Express, Hono, Fastify, Koa</h3>
<span class="card-badge">Minimal</span>
</div>
<p class="card-motto">Freedom, speed, flexibility</p>
<div class="card-traits">
<span class="trait-good">Lightning fast</span>
<span class="trait-good">Total control</span>
<span class="trait-good">Tiny footprint</span>
<span class="trait-warn">DIY architecture</span>
<span class="trait-warn">Manual patterns</span>
</div>
</div>

<div class="landscape-card balanced">
<div class="card-header">
<h3>Ignis, Ts.ED</h3>
<span class="card-badge">Balanced</span>
</div>
<p class="card-motto">Structure with lighter footprint</p>
<div class="card-traits">
<span class="trait-good">Lighter weight</span>
<span class="trait-good">Single file build</span>
<span class="trait-good">Fast startup</span>
<span class="trait-good">ESM native</span>
<span class="trait-good">Modern stack</span>
</div>
</div>

<div class="landscape-card enterprise">
<div class="card-header">
<h3>NestJS, LoopBack 4, AdonisJS</h3>
<span class="card-badge">Enterprise</span>
</div>
<p class="card-motto">Structure, patterns, conventions</p>
<div class="card-traits">
<span class="trait-good">Battle-tested</span>
<span class="trait-good">Rich ecosystem</span>
<span class="trait-good">Strong typing</span>
<span class="trait-warn">Heavy footprint</span>
<span class="trait-warn">Steep learning</span>
</div>
</div>

</div>

## Honest Comparison

### Performance & Runtime

<div class="perf-section">
<div class="perf-chart">

<div class="perf-row">
<div class="perf-info">
<span class="perf-name">Hono</span>
<span class="perf-meta">~10ms startup · ~20MB</span>
</div>
<div class="perf-bar-container">
<div class="perf-bar hono" style="--width: 100%">
<span class="perf-value">~150k req/s</span>
</div>
</div>
<div class="perf-runtime">Bun, Node, Deno, CF Workers</div>
</div>

<div class="perf-row highlight">
<div class="perf-info">
<span class="perf-name">Ignis</span>
<span class="perf-meta">~30ms startup · ~30MB</span>
</div>
<div class="perf-bar-container">
<div class="perf-bar ignis" style="--width: 93%">
<span class="perf-value">~140k req/s</span>
</div>
</div>
<div class="perf-runtime">Bun, Node</div>
</div>

<div class="perf-row">
<div class="perf-info">
<span class="perf-name">Fastify</span>
<span class="perf-meta">~50ms startup · ~40MB</span>
</div>
<div class="perf-bar-container">
<div class="perf-bar fastify" style="--width: 53%">
<span class="perf-value">~80k req/s</span>
</div>
</div>
<div class="perf-runtime">Node only</div>
</div>

<div class="perf-row">
<div class="perf-info">
<span class="perf-name">NestJS</span>
<span class="perf-meta">~500ms startup · ~100MB</span>
</div>
<div class="perf-bar-container">
<div class="perf-bar nestjs" style="--width: 17%">
<span class="perf-value">~25k req/s</span>
</div>
</div>
<div class="perf-runtime">Node (Bun experimental)</div>
</div>

<div class="perf-row">
<div class="perf-info">
<span class="perf-name">LoopBack 4</span>
<span class="perf-meta">~800ms startup · ~120MB</span>
</div>
<div class="perf-bar-container">
<div class="perf-bar loopback" style="--width: 13%">
<span class="perf-value">~20k req/s</span>
</div>
</div>
<div class="perf-runtime">Node only</div>
</div>

<div class="perf-row">
<div class="perf-info">
<span class="perf-name">Express</span>
<span class="perf-meta">~100ms startup · ~50MB</span>
</div>
<div class="perf-bar-container">
<div class="perf-bar express" style="--width: 10%">
<span class="perf-value">~15k req/s</span>
</div>
</div>
<div class="perf-runtime">Node only</div>
</div>

</div>
<p class="perf-footnote">* Benchmarks are approximate and vary by use case</p>
</div>

### Developer Experience

<div class="comparison-table-wrapper">
<table class="comparison-table">
<thead>
<tr>
<th>Aspect</th>
<th>Minimal (Hono/Express)</th>
<th>Enterprise (NestJS/LoopBack)</th>
<th class="highlight-col">Ignis</th>
</tr>
</thead>
<tbody>
<tr>
<td class="feature-name">Setup Time</td>
<td><span class="status-good">5 minutes</span></td>
<td><span class="status-neutral">30+ minutes</span></td>
<td class="highlight-col"><span class="status-best">10 minutes</span></td>
</tr>
<tr>
<td class="feature-name">Learning Curve</td>
<td><span class="status-good">Low</span></td>
<td><span class="status-neutral">High</span></td>
<td class="highlight-col"><span class="status-best">Medium</span></td>
</tr>
<tr>
<td class="feature-name">Boilerplate</td>
<td><span class="status-good">Minimal</span></td>
<td><span class="status-neutral">Heavy</span></td>
<td class="highlight-col"><span class="status-best">Moderate</span></td>
</tr>
<tr>
<td class="feature-name">Type Safety</td>
<td><span class="status-neutral">Manual</span></td>
<td><span class="status-good">Excellent</span></td>
<td class="highlight-col"><span class="status-best">Excellent</span></td>
</tr>
<tr>
<td class="feature-name">IDE Support</td>
<td><span class="status-neutral">Basic</span></td>
<td><span class="status-good">Excellent</span></td>
<td class="highlight-col"><span class="status-good">Good</span></td>
</tr>
<tr>
<td class="feature-name">Documentation</td>
<td><span class="status-good">Good</span></td>
<td><span class="status-good">Excellent</span></td>
<td class="highlight-col"><span class="status-neutral">Growing</span></td>
</tr>
<tr>
<td class="feature-name">Flexibility vs Convention</td>
<td><span class="status-good">Total Freedom</span></td>
<td><span class="status-neutral">Opinionated</span></td>
<td class="highlight-col"><span class="status-best">Guided Flexibility</span></td>
</tr>
</tbody>
</table>
</div>

### Architecture & Patterns

<div class="comparison-table-wrapper">
<table class="comparison-table">
<thead>
<tr>
<th>Feature</th>
<th>Minimal</th>
<th>Enterprise</th>
<th class="highlight-col">Ignis</th>
</tr>
</thead>
<tbody>
<tr>
<td class="feature-name">Dependency Injection</td>
<td><span class="status-neutral">Manual</span></td>
<td><span class="status-good">Built-in (full-featured)</span></td>
<td class="highlight-col"><span class="status-good">Built-in (simpler)</span></td>
</tr>
<tr>
<td class="feature-name">Layered Architecture</td>
<td><span class="status-neutral">DIY</span></td>
<td><span class="status-good">Enforced</span></td>
<td class="highlight-col"><span class="status-good">Guided</span></td>
</tr>
<tr>
<td class="feature-name">Repository Pattern</td>
<td><span class="status-neutral">DIY</span></td>
<td><span class="status-good">Built-in</span></td>
<td class="highlight-col"><span class="status-good">Built-in</span></td>
</tr>
<tr>
<td class="feature-name">Validation</td>
<td><span class="status-neutral">3rd party</span></td>
<td><span class="status-good">Built-in (class-validator)</span></td>
<td class="highlight-col"><span class="status-good">Zod</span></td>
</tr>
<tr>
<td class="feature-name">OpenAPI/Swagger</td>
<td><span class="status-neutral">3rd party</span></td>
<td><span class="status-good">Built-in</span></td>
<td class="highlight-col"><span class="status-good">Built-in</span></td>
</tr>
<tr>
<td class="feature-name">Authentication</td>
<td><span class="status-neutral">DIY</span></td>
<td><span class="status-good">Passport + Guards</span></td>
<td class="highlight-col"><span class="status-good">Component</span></td>
</tr>
</tbody>
</table>
</div>

### Ecosystem & Maturity

<div class="comparison-table-wrapper">
<table class="comparison-table">
<thead>
<tr>
<th>Aspect</th>
<th>Hono</th>
<th>NestJS</th>
<th class="highlight-col">Ignis</th>
</tr>
</thead>
<tbody>
<tr>
<td class="feature-name">GitHub Stars</td>
<td><span class="status-good">~20k</span></td>
<td><span class="status-good">~70k</span></td>
<td class="highlight-col"><span class="status-neutral">New</span></td>
</tr>
<tr>
<td class="feature-name">Weekly Downloads</td>
<td><span class="status-good">~500k</span></td>
<td><span class="status-good">~3M</span></td>
<td class="highlight-col"><span class="status-neutral">Starting</span></td>
</tr>
<tr>
<td class="feature-name">First Release</td>
<td><span class="status-good">2021</span></td>
<td><span class="status-good">2017</span></td>
<td class="highlight-col"><span class="status-neutral">2025</span></td>
</tr>
<tr>
<td class="feature-name">Production Ready</td>
<td><span class="status-good">Yes</span></td>
<td><span class="status-good">Yes</span></td>
<td class="highlight-col"><span class="status-neutral">Early stage</span></td>
</tr>
<tr>
<td class="feature-name">Corporate Backing</td>
<td><span class="status-good">Cloudflare</span></td>
<td><span class="status-good">Trilon</span></td>
<td class="highlight-col"><span class="status-neutral">Independent</span></td>
</tr>
<tr>
<td class="feature-name">Official Plugins</td>
<td><span class="status-good">20+</span></td>
<td><span class="status-good">50+</span></td>
<td class="highlight-col"><span class="status-neutral">Core only</span></td>
</tr>
<tr>
<td class="feature-name">Community Packages</td>
<td><span class="status-good">Growing</span></td>
<td><span class="status-good">Extensive</span></td>
<td class="highlight-col"><span class="status-neutral">Few</span></td>
</tr>
<tr>
<td class="feature-name">LTS / Support</td>
<td><span class="status-good">Active</span></td>
<td><span class="status-good">Enterprise LTS</span></td>
<td class="highlight-col"><span class="status-neutral">Planning</span></td>
</tr>
</tbody>
</table>
</div>

## The Ignis Synthesis

<div class="synthesis">

<div class="synthesis-box source">
<h4>LoopBack 4</h4>
<ul>
<li>DI Container</li>
<li>Layered Architecture</li>
<li>Components</li>
<li>Decorators</li>
</ul>
</div>

<div class="synthesis-operator">+</div>

<div class="synthesis-box source">
<h4>Hono</h4>
<ul>
<li>Blazing Speed</li>
<li>Minimal Core</li>
<li>Modern API</li>
<li>Multi-Runtime</li>
</ul>
</div>

<div class="synthesis-operator">=</div>

<div class="synthesis-box result">
<h4>Ignis</h4>
<ul>
<li>DI + Speed</li>
<li>Structure + Simplicity</li>
<li>Patterns + Performance</li>
<li>Enterprise + Edge</li>
</ul>
</div>

</div>

## What Each Approach Excels At

<div class="excel-section">

<div class="excel-card minimal">
<h3>Minimal Frameworks</h3>
<p class="excel-subtitle">Hono, Express, Fastify</p>
<div class="excel-pros">
<h4>Strengths</h4>
<ul>
<li>Maximum raw performance</li>
<li>Complete architectural freedom</li>
<li>Fastest time to first endpoint</li>
<li>Smallest bundle/memory footprint</li>
<li>Perfect for edge/serverless</li>
<li>Huge ecosystem (Express has 50k+ packages)</li>
</ul>
</div>
<div class="excel-cons">
<h4>Trade-offs</h4>
<ul>
<li>Architecture decisions on your shoulders</li>
<li>Patterns must be implemented manually</li>
<li>Code structure varies per developer</li>
<li>Harder to maintain as project grows</li>
</ul>
</div>
</div>

<div class="excel-card ignis">
<h3>Ignis</h3>
<p class="excel-subtitle">The balanced choice</p>
<div class="excel-pros">
<h4>Strengths</h4>
<ul>
<li>Enterprise patterns with Hono's performance</li>
<li>Lighter weight than NestJS/LoopBack</li>
<li>Modern TypeScript-first with Zod validation</li>
<li>ESM native, Bun optimized</li>
<li>Single file executable build with Bun</li>
<li>Built on proven Hono foundation</li>
<li>Scales from solo dev to large teams</li>
</ul>
</div>
<div class="excel-cons">
<h4>Considerations</h4>
<ul>
<li>Growing community and ecosystem</li>
<li>Documentation expanding continuously</li>
<li>Early adopter opportunity</li>
</ul>
</div>
</div>

<div class="excel-card enterprise">
<h3>Enterprise Frameworks</h3>
<p class="excel-subtitle">NestJS, LoopBack, AdonisJS</p>
<div class="excel-pros">
<h4>Strengths</h4>
<ul>
<li>Battle-tested at massive scale</li>
<li>Comprehensive, mature documentation</li>
<li>Huge community & ecosystem (NestJS ~3M weekly downloads)</li>
<li>Excellent for large teams & long-term projects</li>
<li>Strong conventions prevent architectural chaos</li>
<li>Easy to hire developers who know the framework</li>
<li>Extensive third-party integrations</li>
</ul>
</div>
<div class="excel-cons">
<h4>Trade-offs</h4>
<ul>
<li>Higher resource consumption</li>
<li>Steeper learning curve</li>
<li>More boilerplate code</li>
<li>Slower startup times</li>
</ul>
</div>
</div>

</div>

## When Should You Use Ignis?

<div class="decision-matrix">

<div class="decision-row yes">
<div class="decision-scenario">Medium API (10-100 endpoints)</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Structure prevents spaghetti code</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Any team size (solo to large)</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Scales from solo dev to enterprise teams</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Want DI without NestJS/LoopBack weight</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Lighter alternative, ESM native, enterprise patterns</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Coming from NestJS/LoopBack</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Familiar patterns, better performance</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Need database + auth + OpenAPI</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">All built-in, ready to use</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Performance is important</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Hono's speed with structure</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Bun-first development</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Native Bun support, single file executable build</div>
</div>

<div class="decision-row yes">
<div class="decision-scenario">Growing from Hono project</div>
<div class="decision-verdict">✓ Yes</div>
<div class="decision-reason">Easy migration, same foundation</div>
</div>

<div class="decision-row maybe">
<div class="decision-scenario">3-5 endpoints, solo dev</div>
<div class="decision-verdict">? Maybe</div>
<div class="decision-reason">Start with Hono, migrate later if needed</div>
</div>

<div class="decision-row no">
<div class="decision-scenario">Quick prototype / MVP</div>
<div class="decision-verdict">✗ No</div>
<div class="decision-reason">Use plain Hono for speed</div>
</div>

<div class="decision-row no">
<div class="decision-scenario">Simple proxy / webhook</div>
<div class="decision-verdict">✗ No</div>
<div class="decision-reason">Too much structure for simple tasks</div>
</div>

</div>

## Perfect For

<div class="perfect-grid">

<div class="perfect-card">
<h4>Production APIs</h4>
<p>10-100+ endpoints with enterprise patterns. Controllers, services, repositories — all built-in and ready.</p>
</div>

<div class="perfect-card">
<h4>Teams of Any Size</h4>
<p>Solo developers to large teams. Consistent patterns, DI for testing, scales with your needs.</p>
</div>

<div class="perfect-card">
<h4>Performance-Critical Apps</h4>
<p>Hono's speed with enterprise structure. ~140k req/s with full DI, validation, and OpenAPI.</p>
</div>

<div class="perfect-card">
<h4>Modern Bun Projects</h4>
<p>ESM native, Bun optimized. Build to single executable file for easy deployment.</p>
</div>

</div>

## Choose the Right Tool

<div class="choose-section">

<div class="choose-card">
<h3>Use Hono/Fastify/Express When:</h3>
<ul>
<li><strong>Simple webhook handler</strong> — No structure overhead needed</li>
<li><strong>Edge/serverless functions</strong> — Minimal cold start, tiny bundle</li>
<li><strong>Rapid prototyping</strong> — Get something running in minutes</li>
<li><strong>1-5 endpoint microservices</strong> — Structure adds complexity</li>
<li><strong>Maximum control needed</strong> — No conventions to follow</li>
<li><strong>Learning web development</strong> — Simpler mental model</li>
</ul>
</div>

<div class="choose-card">
<h3>Use NestJS/LoopBack When:</h3>
<ul>
<li><strong>Large team (10+ developers)</strong> — Strong conventions prevent chaos</li>
<li><strong>Enterprise with strict standards</strong> — Mature, battle-tested, auditable</li>
<li><strong>Extensive ecosystem needed</strong> — Many official and community modules</li>
<li><strong>Complex microservices</strong> — Built-in support for messaging, CQRS</li>
<li><strong>Hiring is a priority</strong> — Large talent pool familiar with it</li>
<li><strong>Long-term support critical</strong> — Corporate backing, LTS versions</li>
</ul>
</div>

<div class="choose-card highlight">
<h3>Use Ignis When:</h3>
<ul>
<li><strong>Any size API (10-100+ endpoints)</strong> — Structure without heavy overhead</li>
<li><strong>Any team size</strong> — Scales from solo dev to enterprise teams</li>
<li><strong>Performance matters</strong> — Hono's speed with enterprise patterns</li>
<li><strong>Modern stack preferred</strong> — ESM native, Bun optimized, TypeScript-first</li>
<li><strong>Coming from NestJS/LoopBack</strong> — Familiar patterns, better performance</li>
<li><strong>Need built-in features</strong> — DI, validation, OpenAPI, auth ready to use</li>
</ul>
</div>

</div>

## Why Choose Ignis

<div class="tradeoffs">

<div class="tradeoff gain">
<h3>What You Get</h3>
<ul>
<li><span class="highlight-text">~5x faster</span> than NestJS/LoopBack</li>
<li><span class="highlight-text">Built-in DI</span>, validation, OpenAPI, auth</li>
<li><span class="highlight-text">Structured codebase</span> from day one</li>
<li><span class="highlight-text">Easier testing</span> with dependency injection</li>
<li><span class="highlight-text">Single file build</span> — compile to one executable with Bun</li>
<li><span class="highlight-text">Scales</span> from solo dev to enterprise teams</li>
</ul>
</div>

<div class="tradeoff cost">
<h3>What's Growing</h3>
<ul>
<li><span class="highlight-text">Community</span> — expanding every day</li>
<li><span class="highlight-text">Documentation</span> — continuously improving</li>
<li><span class="highlight-text">Ecosystem</span> — core features ready, plugins coming</li>
<li><span class="highlight-text">LTS</span> — planning for long-term support</li>
</ul>
</div>

</div>

<div class="honest-box">
<h4>Summary</h4>
<div class="honest-grid">
<div class="honest-item"><strong>Performance:</strong> Near Hono speed with enterprise features</div>
<div class="honest-item"><strong>Architecture:</strong> Clean DI, layered structure, patterns</div>
<div class="honest-item"><strong>Features:</strong> Validation, OpenAPI, auth built-in</div>
<div class="honest-item"><strong>Modern:</strong> ESM native, single file build, TypeScript-first</div>
<div class="honest-item"><strong>Scalable:</strong> Solo dev to enterprise teams</div>
<div class="honest-item"><strong>Growing:</strong> Active development, expanding ecosystem</div>
</div>
</div>

<div class="cta-card">
<p><strong>IGNIS</strong> is ideal for developers who want enterprise patterns with modern performance. Start building today with structure that scales.</p>
</div>

## Next Steps

<div class="next-steps-grid">

<a href="./setup" class="next-card">
<span class="next-num">1</span>
<div class="next-content">
<h4>Check Prerequisites</h4>
<p>Install required tools</p>
</div>
<span class="next-arrow">→</span>
</a>

<a href="../tutorials/complete-installation" class="next-card">
<span class="next-num">2</span>
<div class="next-content">
<h4>Complete Installation</h4>
<p>Build your first endpoint</p>
</div>
<span class="next-arrow">→</span>
</a>

<a href="../tutorials/building-a-crud-api" class="next-card">
<span class="next-num">3</span>
<div class="next-content">
<h4>CRUD Tutorial</h4>
<p>Build a complete API</p>
</div>
<span class="next-arrow">→</span>
</a>

</div>
