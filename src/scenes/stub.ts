/** Placeholder scene used until a module agent implements the real one. */
import * as THREE from 'three';
import type { GameScene } from '../core/engine';
import { engine } from '../core/engine';
import { h, layer } from '../ui/dom';

export function stubScene(id: string, title: string, note = 'En construcción'): GameScene {
  let el: HTMLElement | null = null;
  return {
    id, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), domOnly: true,
    enter(params) {
      el = h('div', { class: 'lx-panel', style: 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);min-width:360px;text-align:center' },
        h('div', { class: 'lx-panel-title', style: 'justify-content:center' }, title),
        h('p', { class: 'lx-muted' }, note),
        h('pre', { style: 'text-align:left;font-size:11px;max-height:200px;overflow:auto;opacity:.6' }, JSON.stringify(params ?? {}, (_k, v) => (typeof v === 'function' ? '[fn]' : v), 2)),
        h('button', { class: 'lx-btn', onclick: () => void engine.goto('dev') }, 'Volver al laboratorio'));
      layer('panel').appendChild(el);
    },
    exit() { el?.remove(); },
    update() { /* noop */ },
  };
}
