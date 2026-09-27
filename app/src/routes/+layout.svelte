<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import * as Avatar from '$lib/components/ui/avatar';
	import './layout.css';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

{#if page.url.pathname === '/login'}
	{@render children()}
{:else}
	<div
		class="min-h-dvh bg-primary text-primary-foreground"
		class:h-dvh={page.url.pathname === '/'}
		class:overflow-hidden={page.url.pathname === '/'}
	>
		<div
			class="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 sm:px-8"
			class:h-dvh={page.url.pathname === '/'}
		>
			<header class="flex shrink-0 items-center justify-between py-5">
				<a href={resolve('/')} class="text-lg tracking-wide">concierge</a>
				{#if data.user}
					<details class="relative">
						<summary
							aria-label="Account"
							class="flex cursor-pointer list-none items-center text-sm"
						>
							<Avatar.Root class="size-9 ring-1 ring-primary-foreground/20" aria-hidden="true">
								{#if data.user.image}<Avatar.Image src={data.user.image} alt="" />{/if}
								<Avatar.Fallback class="bg-primary-foreground text-xs font-medium text-primary">
									{data.user.name.trim().charAt(0).toUpperCase() || 'G'}
								</Avatar.Fallback>
							</Avatar.Root>
						</summary>
						<div
							class="absolute top-full right-0 z-10 mt-3 min-w-48 rounded-lg border border-primary-foreground/20 bg-primary p-4 shadow-xl"
						>
							<p class="mb-3 text-xs text-primary-foreground/60">{data.user.email}</p>
							<a href="/?passport=1" class="mb-3 block text-sm hover:underline">Your passport</a>
							<form method="post" action="/?/signOut">
								<button class="text-sm underline underline-offset-4">Sign out</button>
							</form>
						</div>
					</details>
				{/if}
			</header>
			{@render children()}
		</div>
	</div>
{/if}
