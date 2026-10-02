import { useQuery } from '@tanstack/react-query'
import { getSkills, type Skill } from './aiChatApi'

export const AI_SKILLS_KEY = ['ai', 'skills'] as const

const NO_SKILLS: Skill[] = []

/** The skills the server offers. They only change on deploy, so an hour is plenty. */
export function useAiSkills(enabled = true) {
  const query = useQuery({
    queryKey: AI_SKILLS_KEY,
    queryFn: async () => (await getSkills()).skills,
    staleTime: 60 * 60 * 1000,
    enabled,
    retry: false,
  })
  return { ...query, skills: query.data ?? NO_SKILLS }
}
