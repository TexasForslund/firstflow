import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { api } from './client'
import { ApiError } from './errors'
import { queryClient as sharedClient } from './queryClient'
import type { components } from './schema'

export type Conversation = components['schemas']['ConversationRead']
export type Message = components['schemas']['MessageRead']
export type Person = components['schemas']['ConversationPerson']
export type ProjectChoice = components['schemas']['ProjectChoice']

type SendBody = components['schemas']['Body_send_message_api_messages_conversations__conversation_id__messages_post']

const keys = {
  all: ['messages'] as const,
  unread: ['messages', 'unread'] as const,
  conversations: ['messages', 'conversations'] as const,
  conversation: (id: string) => ['messages', 'conversations', id] as const,
  thread: (id: string) => ['messages', 'conversations', id, 'messages'] as const,
  contacts: ['messages', 'contacts'] as const,
  projects: (id: string) => ['messages', 'conversations', id, 'projects'] as const,
}

/** Antal olästa meddelanden, för siffran i menyn. Hålls aktuellt av useMessageEvents. */
export function useUnreadMessages(enabled = true) {
  return useQuery({
    queryKey: keys.unread,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/messages/unread')
      if (!data) throw new ApiError(error, response.status)
      return data.count
    },
  })
}

/**
 * Ström från servern med antal olästa. När ett nytt meddelande kommer hämtas samtalen igen, så
 * att listan och det öppna samtalet uppdateras direkt.
 */
export function useMessageEvents(enabled: boolean) {
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    let latest: string | null | undefined
    const source = new EventSource('/api/messages/events')
    source.addEventListener('messages', (event) => {
      const state = JSON.parse((event as MessageEvent<string>).data) as { unread: number; latest: string | null }
      sharedClient.setQueryData(keys.unread, state.unread)
      // Första gången är inget nytt, det är bara läget när strömmen öppnades.
      if (latest !== undefined && state.latest !== latest) {
        void sharedClient.invalidateQueries({ queryKey: keys.conversations })
      }
      latest = state.latest
    })
    return () => source.close()
  }, [enabled])
}

export function useConversations() {
  return useQuery({
    queryKey: keys.conversations,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/messages/conversations')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useMessages(conversationId: string) {
  return useQuery({
    queryKey: keys.thread(conversationId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/messages/conversations/{conversation_id}/messages', {
        params: { path: { conversation_id: conversationId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Äldre meddelanden än `before`. */
export async function fetchOlder(conversationId: string, before: string) {
  const { data, error, response } = await api.GET('/api/messages/conversations/{conversation_id}/messages', {
    params: { path: { conversation_id: conversationId }, query: { before } },
  })
  if (!data) throw new ApiError(error, response.status)
  return data
}

export function useContacts(enabled = true) {
  return useQuery({
    queryKey: keys.contacts,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/messages/contacts')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export async function fetchContacts() {
  return sharedClient.fetchQuery({
    queryKey: keys.contacts,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/messages/contacts')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useShareableProjects(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.projects(conversationId),
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/messages/conversations/{conversation_id}/projects', {
        params: { path: { conversation_id: conversationId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useStartConversation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { member_ids: string[]; name?: string | null }) => {
      const { data, error, response } = await api.POST('/api/messages/conversations', { body })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.conversations }),
  })
}

/** Gruppen för elevens praktikplats: eleven, handledaren och lärarna. */
export async function fetchPlacementGroup(studentId: string) {
  const { data, error, response } = await api.GET('/api/messages/placement-group', {
    params: { query: { student_id: studentId } },
  })
  if (!data) throw new ApiError(error, response.status)
  return data
}

export function useSendMessage(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ text, projectId, files }: { text: string; projectId?: string; files: File[] }) => {
      const form = new FormData()
      if (text.trim()) form.append('text', text)
      if (projectId) form.append('project_id', projectId)
      for (const file of files) form.append('files', file)
      const { data, error, response } = await api.POST('/api/messages/conversations/{conversation_id}/messages', {
        params: { path: { conversation_id: conversationId } },
        // Typen säger strängar, men API:t tar emot multipart.
        body: form as unknown as SendBody,
        bodySerializer: (body) => body as unknown as FormData,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.conversation(conversationId) }),
  })
}

export function useMarkRead(conversationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await api.POST('/api/messages/conversations/{conversation_id}/read', {
        params: { path: { conversation_id: conversationId } },
      })
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.unread })
      void queryClient.invalidateQueries({ queryKey: keys.conversations, exact: true })
    },
  })
}
