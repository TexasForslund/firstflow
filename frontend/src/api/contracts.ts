import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from './client'
import { ApiError } from './errors'
import type { components } from './schema'

export type Contract = components['schemas']['ContractSummary']
export type ContractDetail = components['schemas']['ContractDetail']
export type Signer = components['schemas']['Signer']
export type SignerRole = components['schemas']['SignerRole']

const keys = {
  all: ['contracts'] as const,
  one: (id: string) => ['contracts', id] as const,
}

/** Lärarens kontrakt, eller kontrakten där eleven eller handledaren är part. */
export function useContracts(enabled = true) {
  return useQuery({
    queryKey: keys.all,
    enabled,
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/contracts')
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useContract(contractId: string) {
  return useQuery({
    queryKey: keys.one(contractId),
    queryFn: async () => {
      const { data, error, response } = await api.GET('/api/contracts/{contract_id}', {
        params: { path: { contract_id: contractId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

/** Adressen till PDF:en. Den hämtas direkt av webbläsaren, med inloggningskakan. */
export function pdfUrl(contractId: string, download = false) {
  return `/api/contracts/${contractId}/pdf${download ? '?download=true' : ''}`
}

export interface NewContract {
  file: File
  title: string
  studentId: string
  workplaceId: string
  supervisorId: string
  startDate: string
  endDate: string
  send: boolean
}

export function useCreateContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: NewContract) => {
      const form = new FormData()
      form.append('file', input.file)
      form.append('title', input.title)
      form.append('student_id', input.studentId)
      form.append('workplace_id', input.workplaceId)
      form.append('supervisor_id', input.supervisorId)
      if (input.startDate) form.append('start_date', input.startDate)
      if (input.endDate) form.append('end_date', input.endDate)
      form.append('send', String(input.send))
      const { data, error, response } = await api.POST('/api/contracts', {
        // Typen säger att filen är en sträng, men API:t tar emot multipart.
        body: form as unknown as components['schemas']['Body_create_contract_api_contracts_post'],
        bodySerializer: (body) => body as unknown as FormData,
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

function useContractAction(contractId: string, action: 'send' | 'sign') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } =
        action === 'send'
          ? await api.POST('/api/contracts/{contract_id}/send', { params: { path: { contract_id: contractId } } })
          : await api.POST('/api/contracts/{contract_id}/sign', {
              params: { path: { contract_id: contractId } },
              body: { confirm: true },
            })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
    onSuccess: (data) => {
      queryClient.setQueryData(keys.one(contractId), data)
      queryClient.invalidateQueries({ queryKey: keys.all })
    },
  })
}

export function useSendContract(contractId: string) {
  return useContractAction(contractId, 'send')
}

export function useSignContract(contractId: string) {
  return useContractAction(contractId, 'sign')
}

export function useRemind(contractId: string) {
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await api.POST('/api/contracts/{contract_id}/remind', {
        params: { path: { contract_id: contractId } },
      })
      if (!data) throw new ApiError(error, response.status)
      return data
    },
  })
}

export function useDeleteContract() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (contractId: string) => {
      const { error, response } = await api.DELETE('/api/contracts/{contract_id}', {
        params: { path: { contract_id: contractId } },
      })
      if (!response.ok) throw new ApiError(error, response.status)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export const roleLabel: Record<SignerRole, string> = {
  student: 'Elev',
  supervisor: 'Handledare',
  teacher: 'Lärare',
}

const waitingFor: Record<SignerRole, string> = {
  student: 'eleven',
  supervisor: 'handledaren',
  teacher: 'läraren',
}

/** Parterna i ordningen elev, lärare, handledare, som i skissen. */
export function displayOrder(signers: Signer[]) {
  const order: SignerRole[] = ['student', 'teacher', 'supervisor']
  return [...signers].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))
}

/** Kort status för listan, t.ex. "Väntar på handledare" eller "1 av 3 signerat". */
export function statusText(contract: Contract) {
  if (contract.status === 'draft') return 'Utkast'
  if (contract.status === 'signed') return 'Klart'
  const waiting = contract.signers.filter((s) => !s.signed_at)
  if (waiting.length === 1) return `Väntar på ${waitingFor[waiting[0].role]}`
  const signed = contract.signers.length - waiting.length
  return `${signed} av ${contract.signers.length} signerat`
}
