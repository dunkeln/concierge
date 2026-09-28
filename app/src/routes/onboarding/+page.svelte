<script lang="ts">
	import * as Avatar from '$lib/components/ui/avatar';
	import PreferencesForm from '$lib/PreferencesForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Your taste — Concierge</title></svelte:head>

<main class="flex flex-1 items-center py-12 sm:py-16">
	<div class="w-full max-w-3xl">
		<div class="flex items-center gap-3">
			<Avatar.Root class="size-12 ring-1 ring-primary-foreground/20" aria-hidden="true">
				{#if data.user?.image}<Avatar.Image src={data.user.image} alt="" />{/if}
				<Avatar.Fallback class="bg-primary-foreground text-base font-medium text-primary">
					{data.user?.name?.trim().charAt(0).toUpperCase() || 'G'}
				</Avatar.Fallback>
			</Avatar.Root>
			<div>
				<p class="text-xs tracking-[0.3em] text-primary-foreground/55 uppercase">
					{data.profile ? 'Your preferences' : 'Your first page'}
				</p>
			</div>
		</div>
		<h1 class="mt-5 max-w-2xl text-[clamp(2.5rem,7vw,5rem)] leading-[1.02] tracking-tight">
			What sounds like a good plan?
		</h1>
		<p class="mt-5 max-w-xl text-base leading-relaxed text-primary-foreground/65">
			Which plans sound like you? Pick one or two. We’ll use them as a starting point, and you can
			always ask for something different.
		</p>

		<PreferencesForm profile={data.profile} message={form?.message} />
	</div>
</main>
