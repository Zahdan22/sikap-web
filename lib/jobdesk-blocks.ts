export type JobdeskBlock = {
  mulaiMenit: number
  selesaiMenit: number
  jobdeskIds: number[]
}

function sameJobdesks(left: number[], right: number[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function normalizedIds(ids: number[]) {
  return [...new Set(ids)].sort((left, right) => left - right)
}

/** Keep adjacent blocks together when they have the exact same jobdesk. */
export function normalizeJobdeskBlocks(blocks: JobdeskBlock[]): JobdeskBlock[] {
  const valid = blocks
    .filter((block) => Number.isInteger(block.mulaiMenit)
      && Number.isInteger(block.selesaiMenit)
      && block.selesaiMenit > block.mulaiMenit
      && block.jobdeskIds.length > 0)
    .map((block) => ({ ...block, jobdeskIds: normalizedIds(block.jobdeskIds) }))
    .sort((left, right) => left.mulaiMenit - right.mulaiMenit || left.selesaiMenit - right.selesaiMenit)

  return valid.reduce<JobdeskBlock[]>((result, block) => {
    const previous = result.at(-1)
    if (previous && previous.selesaiMenit === block.mulaiMenit && sameJobdesks(previous.jobdeskIds, block.jobdeskIds)) {
      previous.selesaiMenit = block.selesaiMenit
    } else {
      result.push({ ...block })
    }
    return result
  }, [])
}

/** Replace one time range without losing the parts before and after it. */
export function replaceJobdeskBlockRange(
  blocks: JobdeskBlock[],
  mulaiMenit: number,
  selesaiMenit: number,
  jobdeskIds: number[],
): JobdeskBlock[] {
  const replacement: JobdeskBlock[] = []

  for (const block of blocks) {
    if (block.selesaiMenit <= mulaiMenit || block.mulaiMenit >= selesaiMenit) {
      replacement.push({ ...block, jobdeskIds: [...block.jobdeskIds] })
      continue
    }
    if (block.mulaiMenit < mulaiMenit) {
      replacement.push({ ...block, selesaiMenit: mulaiMenit, jobdeskIds: [...block.jobdeskIds] })
    }
    if (block.selesaiMenit > selesaiMenit) {
      replacement.push({ ...block, mulaiMenit: selesaiMenit, jobdeskIds: [...block.jobdeskIds] })
    }
  }

  if (jobdeskIds.length > 0) replacement.push({ mulaiMenit, selesaiMenit, jobdeskIds })
  return normalizeJobdeskBlocks(replacement)
}

/** A flexible Warkop schedule must cover the entire shift exactly once. */
export function blocksCoverShift(blocks: JobdeskBlock[], shiftStart: number, shiftEnd: number) {
  if (!Number.isInteger(shiftStart) || !Number.isInteger(shiftEnd) || shiftEnd <= shiftStart) return false
  const ordered = [...blocks]
    .filter((block) => block.jobdeskIds.length > 0)
    .sort((left, right) => left.mulaiMenit - right.mulaiMenit || left.selesaiMenit - right.selesaiMenit)

  if (ordered.length === 0 || ordered[0].mulaiMenit !== shiftStart || ordered.at(-1)?.selesaiMenit !== shiftEnd) return false
  return ordered.every((block, index) => block.mulaiMenit >= shiftStart
    && block.selesaiMenit <= shiftEnd
    && (index === 0 || ordered[index - 1].selesaiMenit === block.mulaiMenit))
}
