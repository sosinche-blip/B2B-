# V226 AdminPlus preflight/payload parity

- 사전검증과 실제 주문등록이 동일한 payload builder를 사용합니다.
- 수령인, 전화번호, 5자리 우편번호, 주소, 상품문자열, 수량을 실제 POST 전에 검증합니다.
- +82 전화번호를 국내 숫자형으로 정규화합니다.
- 우편번호 필드가 비어 있고 주소에 5자리 우편번호가 포함된 경우 안전하게 보완합니다.
- AdminPlus validation 응답의 중첩 errors/details/validation 정보를 운영화면에 노출합니다.
- revision: `adminplus-preflight-payload-parity-v226-20260810`
