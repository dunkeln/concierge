<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import type { Menu } from '$lib/menu';
	let {
		menu,
		selectedIds = [],
		disabled = false,
		onSelect
	}: {
		menu: Menu;
		selectedIds?: string[];
		disabled?: boolean;
		onSelect: (id: string) => void;
	} = $props();
	let expanded = $state(false);
	const dishes = $derived(expanded ? menu.items : menu.items.slice(0, 4));
</script>

<section
	aria-label={`${menu.restaurant} menu`}
	class="w-full max-w-md self-end overflow-hidden rounded-3xl bg-secondary/65 p-4 text-primary-foreground sm:p-5"
>
	<header class="mb-3 flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h3 class="text-base font-semibold tracking-tight">{menu.restaurant}</h3>
			<p class="mt-0.5 text-xs text-primary-foreground/55">{menu.area}</p>
		</div>
		<a
			href={menu.sourceUrl}
			target="_blank"
			rel="noopener noreferrer"
			class="inline-flex min-h-11 shrink-0 items-center gap-0.5 text-xs text-primary-foreground/65 underline decoration-primary-foreground/30 underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
			aria-label={`Open menu source for ${menu.restaurant}`}
		>
			Menu <ArrowUpRight size={13} strokeWidth={1.5} />
		</a>
	</header>
	<div
		class={expanded ? 'max-h-96 space-y-1 overflow-y-auto overscroll-contain' : 'space-y-1'}
		aria-label="Dishes"
	>
		{#each dishes as dish, index (dish.id)}
			{@const selected = selectedIds.includes(dish.id)}
			<button
				type="button"
				aria-pressed={selected}
				aria-label={dish.name}
				disabled={disabled || (!selected && selectedIds.length >= 12)}
				onclick={() => onSelect(dish.id)}
				class={`flex min-h-14 w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${selected ? 'bg-primary-foreground/10' : 'hover:bg-primary-foreground/5'}`}
			>
				<span class="min-w-0 flex-1">
					{#if dish.section && (index === 0 || dishes[index - 1].section !== dish.section)}<span
							class="mb-0.5 block text-[11px] text-primary-foreground/50">{dish.section}</span
						>{/if}
					<span class="block text-sm font-medium">{dish.name}</span>
					{#if dish.description}<span
							class="mt-1 line-clamp-2 block text-xs leading-snug text-primary-foreground/60"
							>{dish.description}</span
						>{/if}
				</span>
				{#if dish.price}<span class="shrink-0 text-xs text-primary-foreground/65 tabular-nums"
						>{dish.price}</span
					>{/if}
				<span
					aria-hidden="true"
					class={`flex size-5 shrink-0 items-center justify-center rounded-full ${selected ? 'bg-primary-foreground text-primary' : 'border border-primary-foreground/25'}`}
				>
					{#if selected}<Check size={13} strokeWidth={2.5} />{/if}
				</span>
			</button>
		{/each}
	</div>
	{#if menu.items.length > 4}
		<button
			type="button"
			onclick={() => (expanded = !expanded)}
			class="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 text-xs text-primary-foreground/65 focus-visible:ring-2 focus-visible:ring-ring"
			aria-expanded={expanded}
		>
			{expanded ? 'Show less' : `More dishes · ${menu.items.length - 4}`}<ChevronDown
				size={14}
				class={expanded ? 'rotate-180' : ''}
			/>
		</button>
	{/if}
	<time datetime={menu.checkedAt} class="mt-2 block text-[10px] text-primary-foreground/40"
		>Read {new Date(menu.checkedAt).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric'
		})}</time
	>
</section>
