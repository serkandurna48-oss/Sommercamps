'use client'

import ParticipantPrintDialog, { type ParticipantPrintProps } from './ParticipantPrintDialog'

export default function ParticipantListPrint(props: ParticipantPrintProps) {
  return <ParticipantPrintDialog {...props} purpose="participants" />
}