import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Invitation = components['schemas']['InvitationRead']
export type InvitationStatus = components['schemas']['InvitationStatus']
export type InvitePreview = components['schemas']['InvitePreview']
export type AcceptInvite = components['schemas']['AcceptInvite']
export type CompanyProfile = components['schemas']['CompanyProfile']
export type SupervisorWorkplace = components['schemas']['SupervisorWorkplace']
export type NotificationList = components['schemas']['NotificationList']

const keys = {
  invitations: ['invitations'] as const,
  preview: (token: string) => ['invite', token] as const,
  supervisorWorkplaces: ['supervisor', 'workplaces'] as const,
  notifications: ['notifications'] as const,
}

// --- Lärare och skoladmin ---

export function useInvitations() {
  return useQuery({
    queryKey: keys.invitations,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/invitations')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useInviteSupervisor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error, response } = await api.POST('/api/invitations', { body: { email } })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations }),
  })
}

export function useResendInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST('/api/invitations/{invitation_id}/resend', {
        params: { path: { invitation_id: id } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations }),
  })
}

export function useRevokeInvitation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error, response } = await api.DELETE('/api/invitations/{invitation_id}', {
        params: { path: { invitation_id: id } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.invitations }),
  })
}

// --- Länken i mejlet ---

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: keys.preview(token),
    retry: false,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/invite/{token}', {
        params: { path: { token } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useAcceptInvite(token: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: AcceptInvite) => {
      const { data, error, response } = await api.POST('/api/invite/{token}/accept', {
        params: { path: { token } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    // Handledaren är inloggad direkt.
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
  })
}

// --- Handledaren ---

export function useSupervisorWorkplaces() {
  return useQuery({
    queryKey: keys.supervisorWorkplaces,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/supervisor/workplaces')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useUpdateCompany(workplaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: CompanyProfile) => {
      const { data, error, response } = await api.PUT('/api/supervisor/workplaces/{workplace_id}', {
        params: { path: { workplace_id: workplaceId } },
        body,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.supervisorWorkplaces }),
  })
}

export function useInviteColleague(workplaceId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (email: string) => {
      const { data, error, response } = await api.POST('/api/supervisor/workplaces/{workplace_id}/invitations', {
        params: { path: { workplace_id: workplaceId } },
        body: { email },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.supervisorWorkplaces }),
  })
}

// --- Notiser ---

export function useNotifications() {
  return useQuery({
    queryKey: keys.notifications,
    // Kolla efter nya notiser varje minut.
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/notifications')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error, response } = await api.POST('/api/notifications/read')
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.notifications }),
  })
}
