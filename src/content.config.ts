import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const apps = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/apps' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().url(),
    image: z.string().optional(), // Path to logo/image in public folder
    stack: z.array(z.string()),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/projects' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    url: z.string().url(),
    image: z.string().optional(), // Path to logo/image in public folder
    stack: z.array(z.string()),
    featured: z.boolean().default(false),
    order: z.number().default(0),
  }),
});

const updates = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/updates' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    investedMoney: z.number(), // Change in invested money (can be + or -)
    defiIncome: z.number(), // DeFi fees earned (always positive)
    highlights: z.array(z.string()).default([]),
  }),
});

export const collections = { apps, projects, updates };
