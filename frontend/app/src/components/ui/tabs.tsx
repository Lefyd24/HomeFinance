"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  [
    "group/tabs-list items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
    // Touch targets: 36px on phones, back to the compact 32px from `sm` up.
    "group-data-horizontal/tabs:h-9 sm:group-data-horizontal/tabs:h-8",
    // A horizontal strip that runs out of room scrolls instead of crushing its
    // triggers into each other — the failure mode on narrow phones. Hide the
    // scrollbar: it sits inside a 3px-padded pill where it looks like damage.
    "max-w-full group-data-horizontal/tabs:overflow-x-auto group-data-horizontal/tabs:overscroll-x-contain",
    "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  ],
  {
    variants: {
      variant: {
        default: "bg-[var(--tabs-list-bg)] border border-[var(--tabs-list-border)] shadow-sm",
        line: "gap-1 bg-[var(--tabs-list-bg)] border border-[var(--tabs-list-border)] shadow-sm",
      },
      fullWidth: {
        true: "flex w-full justify-stretch gap-0.5",
        false: "inline-flex w-fit",
      },
    },
    defaultVariants: {
      variant: "default",
      fullWidth: false,
    },
  }
)

function TabsList({
  className,
  variant = "default",
  fullWidth = false,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-fullwidth={fullWidth ? "true" : "false"}
      className={cn(tabsListVariants({ variant, fullWidth }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2.5 py-0.5 text-sm font-medium whitespace-nowrap text-[var(--tabs-inactive-foreground)] transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pe-1 has-data-[icon=inline-start]:ps-1 dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-none group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:border-transparent",
        // Only stretch-to-fill lists divide the space between triggers. Everywhere
        // else a trigger keeps its natural width so the list scrolls (see TabsList)
        // rather than shrinking labels until they collide.
        "group-data-[fullwidth=false]/tabs-list:flex-none group-data-[fullwidth=false]/tabs-list:shrink-0",
        "data-active:bg-primary data-active:text-primary-foreground data-active:border-transparent data-active:shadow-none",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-end-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
