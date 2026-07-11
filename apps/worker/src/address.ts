/**
 * 배송지 주소를 손실 없이 결합합니다.
 *
 * 마켓 API에 따라 주소가 다음처럼 나뉘어 전달될 수 있습니다.
 * - 쿠팡: receiver.addr1 + receiver.addr2
 * - 토스: address + detailAddress
 * - 일부 응답: address에 전체 주소가 있고 addr1에는 괄호까지의 기본주소만 존재
 *
 * 가장 긴 전체주소를 우선 보존하고, 빠진 상세주소만 뒤에 추가합니다.
 */
export function cleanAddressPart(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableAddress(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, "");
}

function includesAddressPart(container: string, part: string): boolean {
  const normalizedContainer = comparableAddress(container);
  const normalizedPart = comparableAddress(part);
  return Boolean(
    normalizedContainer &&
      normalizedPart &&
      normalizedContainer.includes(normalizedPart),
  );
}

/**
 * 입력 순서는 기본주소 -> 전체주소 후보 -> 상세주소 순서를 권장합니다.
 */
export function joinAddressParts(...values: unknown[]): string {
  const merged: string[] = [];

  values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map(cleanAddressPart)
    .filter(Boolean)
    .forEach((candidate) => {
      // 이미 더 긴 주소 안에 포함된 조각이면 중복 추가하지 않습니다.
      if (merged.some((existing) => includesAddressPart(existing, candidate))) {
        return;
      }

      // 새 후보가 기존 조각을 포함하는 더 완전한 주소라면 기존 조각을 대체합니다.
      const containedIndexes = merged
        .map((existing, index) =>
          includesAddressPart(candidate, existing) ? index : -1,
        )
        .filter((index) => index >= 0);

      if (containedIndexes.length) {
        const firstIndex = containedIndexes[0];
        merged[firstIndex] = candidate;
        for (let index = containedIndexes.length - 1; index >= 1; index -= 1) {
          merged.splice(containedIndexes[index], 1);
        }
        return;
      }

      merged.push(candidate);
    });

  return merged.join(" ").replace(/\s+/g, " ").trim();
}
