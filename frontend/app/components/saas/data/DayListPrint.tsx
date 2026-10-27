'use client'

import ParticipantPrintDialog, { type ParticipantPrintProps } from './ParticipantPrintDialog'

export default function DayListPrint(props: ParticipantPrintProps) {
  return <ParticipantPrintDialog {...props} purpose="daylist" />
}