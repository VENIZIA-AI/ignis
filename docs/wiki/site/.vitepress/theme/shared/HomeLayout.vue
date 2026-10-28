<!--
  Shared by the three wikis (IGNIS, ARDOR, VULCAN): a byte-identical copy in each, kept in step by
  scripts/wiki-shared in VULCAN. Edit it there, never in a copy.

  The home page: hero with the animated terminal, proof strip, feature grid, an optional extra section,
  steps, fit and maturity. The structure, the design and the behaviour are shared; every sentence is in
  the `content` a wiki passes (its home-content.ts).
-->
<script setup lang="ts">
import { ref } from 'vue';
import HomeWindow from './HomeWindow.vue';
import type { THomeContent } from './home-types';
import InstallBox from './InstallBox.vue';
import TerminalView from './TerminalView.vue';
import { useReveal } from './useReveal';
import { useTerminal } from './useTerminal';

defineProps<{ content: THomeContent }>();

const root = ref<HTMLElement | null>(null);

useReveal(root);
useTerminal(root);

const isExternal = (href: string): boolean => /^https?:/.test(href);
const targetOf = (href: string) => (isExternal(href) ? '_blank' : undefined);
const relOf = (href: string) => (isExternal(href) ? 'noopener noreferrer' : undefined);
</script>

<template>
  <div ref="root" class="vh">
    <section class="hero">
      <div class="wrap">
        <div class="hero-head">
          <div class="eyebrow"><i></i>{{ content.eyebrow }}</div>
          <h1>
            <span v-for="(line, index) in content.title[0]" :key="line" class="ln"
              ><span :style="{ '--i': index }">{{ line }}</span></span
            ><span class="ln"
              ><span :style="{ '--i': content.title[0].length }"
                ><em>{{ content.title[1] }}</em></span
              ></span
            >
          </h1>
        </div>
        <div class="hero-copy">
          <p class="lede reveal">{{ content.lede }}</p>
          <p v-if="content.ledeNote" class="lede-note reveal">{{ content.ledeNote }}</p>
          <InstallBox
            class="reveal"
            style="--i: 1"
            :label="content.install.label"
            :lines="content.install.lines"
          />
          <div class="cta reveal" style="--i: 2">
            <a
              class="btn btn--primary"
              :href="content.cta[0][1]"
              :target="targetOf(content.cta[0][1])"
              :rel="relOf(content.cta[0][1])"
              >{{ content.cta[0][0] }}</a
            >
            <a
              class="btn btn--ghost"
              :href="content.cta[1][1]"
              :target="targetOf(content.cta[1][1])"
              :rel="relOf(content.cta[1][1])"
              >{{ content.cta[1][0] }}</a
            >
          </div>
        </div>
        <HomeWindow :id="content.id" :tabs="content.tabs" />
      </div>
    </section>

    <section class="proof">
      <div class="wrap">
        <div class="stats reveal">
          <div v-for="[count, label] in content.stats" :key="label" class="stat">
            <b>{{ count }}</b
            ><span>{{ label }}</span>
          </div>
        </div>
        <p class="footnote reveal">{{ content.footnote }}</p>
      </div>
    </section>

    <section id="features" class="section">
      <div class="wrap">
        <div class="sec-head reveal">
          <div class="eyebrow"><i></i>{{ content.featuresTitle }}</div>
          <h2>{{ content.featuresLede }}</h2>
        </div>
        <div class="grid">
          <template v-for="(cell, index) in content.cells" :key="cell.name">
            <a
              v-if="cell.href"
              class="cell reveal"
              :style="{ '--i': index % 4 }"
              :href="cell.href"
              :target="targetOf(cell.href)"
              :rel="relOf(cell.href)"
            >
              <span class="name">{{ cell.name }}</span>
              <span
                v-if="cell.chip"
                :class="['chip', cell.chip[1] ? `chip--${cell.chip[1]}` : '']"
                >{{ cell.chip[0] }}</span
              >
              <h3>{{ cell.title }}</h3>
              <p>{{ cell.text }}</p>
              <span class="more">Read</span>
            </a>
            <div v-else class="cell reveal" :style="{ '--i': index % 4 }">
              <span class="name">{{ cell.name }}</span>
              <span
                v-if="cell.chip"
                :class="['chip', cell.chip[1] ? `chip--${cell.chip[1]}` : '']"
                >{{ cell.chip[0] }}</span
              >
              <h3>{{ cell.title }}</h3>
              <p>{{ cell.text }}</p>
            </div>
          </template>
        </div>
        <div v-if="content.builtOn" class="built-on reveal">
          Built on <span v-for="name in content.builtOn" :key="name" class="pill">{{ name }}</span>
        </div>
      </div>
    </section>

    <div v-if="content.extraHtml" v-html="content.extraHtml" />

    <section v-if="content.steps" class="section">
      <div class="wrap">
        <div class="sec-head reveal">
          <div class="eyebrow"><i></i>Start</div>
          <h2>{{ content.stepsTitle }}</h2>
        </div>
        <div class="steps">
          <div
            v-for="(step, index) in content.steps"
            :key="step.title"
            class="step reveal"
            :style="{ '--i': index }"
          >
            <h3>{{ step.title }}</h3>
            <p>{{ step.text }}</p>
            <div class="win-panel mono"><TerminalView :lines="step.lines" /></div>
          </div>
        </div>
      </div>
    </section>

    <section id="fit" :class="['section', { 'section--soft': content.steps }]">
      <div class="wrap">
        <div class="sec-head reveal">
          <div class="eyebrow"><i></i>Is it for you?</div>
          <h2>Honest about the fit.</h2>
        </div>
        <div class="fit">
          <div class="reveal">
            <h3>Use {{ content.name }} when</h3>
            <ul>
              <li v-for="item in content.fitUse" :key="item">{{ item }}</li>
            </ul>
          </div>
          <div class="no reveal" style="--i: 1">
            <h3>Look elsewhere when</h3>
            <ul>
              <li v-for="item in content.fitNot" :key="item">{{ item }}</li>
            </ul>
          </div>
        </div>
        <p class="maturity reveal" v-html="content.maturityHtml" />
      </div>
    </section>
  </div>
</template>
