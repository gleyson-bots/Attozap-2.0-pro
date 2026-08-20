# Notas externas — geração de imagens

## Pollinations
Fonte oficial: https://raw.githubusercontent.com/pollinations/pollinations/master/APIDOCS.md

A documentação oficial descreve o endpoint de imagem `https://image.pollinations.ai/prompt/{prompt}`. O pedido pode usar parâmetros como `model`, `width`, `height`, `seed` e `safe`; a documentação também descreve autenticação Bearer para uso de backend e limites diferentes para acesso anónimo/registado. Para o adaptador local, as chaves devem permanecer no processo principal.

## Hugging Face Inference Providers
Fonte oficial: https://huggingface.co/docs/inference-providers/en/tasks/text-to-image

A tarefa Text to Image aceita token HF com permissão Inference Providers, prompt em `inputs` e parâmetros opcionais como `width`, `height`, `negative_prompt`, `num_inference_steps` e `seed`. A resposta é imagem em bytes. O modelo recomendado pode variar; o modelo deve ser configurável e não hardcoded como verdade permanente.

## OpenRouter Image Generation
Fonte oficial: https://openrouter.ai/docs/guides/overview/multimodal/image-generation

A API dedicada usa `POST /api/v1/images` com `model` e `prompt`; a resposta contém imagem em base64 e `media_type` quando identificável. A documentação descreve `aspect_ratio`, `resolution`/`size`, `quality`, `output_format`, `n`, referência de imagens e descoberta de modelos por capacidade. O adaptador deve aceitar o retorno base64 e validar o media type antes de gravar o ficheiro.
