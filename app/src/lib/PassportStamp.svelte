<script lang="ts">
	import { passportStamp } from './passport-stamp';
	let { id, scene }: { id: string; scene: string } = $props();
	let stamp = $derived(passportStamp(id, scene));
</script>

<svg viewBox="0 0 120 120" class="size-24 shrink-0" aria-hidden="true" focusable="false">
	<g transform={`rotate(${stamp.rotation} 60 60)`} fill="none" stroke="currentColor">
		<rect x="8" y="8" width="104" height="104" rx="27" stroke-width="2" />
		<rect x="16" y="16" width="88" height="88" rx="21" stroke-width="0.9" opacity="0.65" />
		{#each stamp.marks as mark}
			<line
				x1="60"
				y1="20"
				x2="60"
				y2={20 + mark.length}
				transform={`rotate(${mark.angle} 60 60)`}
				stroke-width="1.5"
				stroke-linecap="round"
			/>
		{/each}
		{#if stamp.motif === 'arches'}
			<path
				d="M34 78V57a26 26 0 0 1 52 0v21 M43 78V57a17 17 0 0 1 34 0v21 M52 78V57a8 8 0 0 1 16 0v21"
				stroke-width="2.5"
				stroke-linecap="round"
			/>
		{:else if stamp.motif === 'rays'}
			<circle cx="60" cy="60" r="13" stroke-width="2.5" />
			{#each Array.from({ length: 12 }, (_, index) => index) as ray}
				<line
					x1="60"
					y1="34"
					x2="60"
					y2="40"
					transform={`rotate(${ray * 30} 60 60)`}
					stroke-width="2.5"
					stroke-linecap="round"
				/>
			{/each}
		{:else if stamp.motif === 'compass'}
			<path
				d="M60 31 68 52 89 60 68 68 60 89 52 68 31 60 52 52Z"
				stroke-width="2.5"
				stroke-linejoin="round"
			/>
			<circle cx="60" cy="60" r="5" stroke-width="2" />
		{:else}
			<path
				d="M36 50h42v18a18 18 0 0 1-18 18h-6a18 18 0 0 1-18-18V50Z M78 54h6a9 9 0 0 1 0 18h-7 M43 40c0-5 5-5 5-10 M57 40c0-5 5-5 5-10 M71 40c0-5 5-5 5-10"
				stroke-width="2.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		{/if}
	</g>
</svg>
