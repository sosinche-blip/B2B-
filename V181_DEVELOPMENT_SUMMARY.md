# V181_DEVELOPMENT_SUMMARY

## 문제

Cloudflare Pages 빌드가 `npm clean-install` 단계에서 다음 오류로 실패했습니다.

```text
npm error code ETIMEDOUT
npm error network request to https://packages.applied-caas-gateway1.internal.api.openai.org/.../xlsx-0.18.5.tgz failed
```

## 판단

GitHub 소스와 Pages 설정은 맞았지만, `package-lock.json`의 resolved URL이 내부 레지스트리로 잠겨 있어 Cloudflare가 패키지를 받을 수 없었습니다.

## 조치

- `package-lock.json` 내부 resolved URL을 public npm registry URL로 변경
- `.npmrc`의 `registry=https://registry.npmjs.org/` 유지
- 앱 버전 V181로 변경
- 검증 스크립트 V181 기준 수정
