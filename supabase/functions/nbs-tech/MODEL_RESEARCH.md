# Model Research - Faster Alternatives to Gemma-2B

## Current Model

**Model**: `google-deepmind/gemma-2b`  
**Version**: `26b2c530f16236a4816611509730c2e6f7b27875a6d33ec5cff42961750c98d8`

### Current Performance Issues

- Processing times: 6+ minutes for large HTML inputs
- Context window: Limited (exact size varies by model version)
- Speed: Not optimized for long sequences

## Faster Model Alternatives

### 1. RecurrentGemma-2B

**Model**: `google-deepmind/recurrent-gemma-2b`

**Key Features**:
- **Architecture**: Griffin architecture combining linear recurrences with local attention
- **Efficiency**: Compresses input sequences into fixed-size state
- **Memory**: Reduced memory usage compared to standard transformer models
- **Speed**: Faster inference on long sequences
- **Performance**: Comparable to Gemma-2B despite being trained on fewer tokens

**Advantages**:
- Specifically designed for efficient inference on long sequences
- Better memory efficiency
- Faster processing for article summarization tasks

**Considerations**:
- May need to verify Replicate availability
- Check model version compatibility
- Test quality vs. current model

**Replicate Link**: https://replicate.com/google-deepmind/recurrent-gemma-2b

---

### 2. Mistral Small 3.1

**Model**: `mistralai/mistral-small-3.1`

**Key Features**:
- **Speed**: 150 tokens per second inference speed
- **Context Window**: Up to 128,000 tokens (massive improvement)
- **License**: Apache 2.0 (open source)
- **Multimodal**: Supports text and other modalities
- **Multilingual**: Better support for multiple languages

**Advantages**:
- Very fast inference speed
- Huge context window (can handle very long articles)
- State-of-the-art performance
- Good for summarization tasks

**Considerations**:
- Larger model size may affect cold start times
- Cost may be higher than Gemma-2B
- Verify Replicate availability and pricing

**Replicate Link**: https://replicate.com/mistralai/mistral-small-3.1

---

### 3. Llama 3.1 8B

**Model**: `meta/meta-llama-3.1-8b-instruct`

**Key Features**:
- **Size**: 8B parameters (larger than Gemma-2B)
- **Context**: 128K token context window
- **Speed**: Optimized inference
- **Quality**: Strong performance on summarization

**Advantages**:
- Good balance of speed and quality
- Large context window
- Well-supported on Replicate

**Considerations**:
- Larger than Gemma-2B (may be slower)
- May require different prompt formatting

**Replicate Link**: https://replicate.com/meta/meta-llama-3.1-8b-instruct

---

### 4. Qwen2.5 7B

**Model**: `qwen/qwen2.5-7b-instruct`

**Key Features**:
- **Speed**: Fast inference
- **Context**: 32K token context window
- **Quality**: Strong performance
- **Multilingual**: Good multilingual support

**Advantages**:
- Fast processing
- Good quality-to-speed ratio
- Reasonable context window

**Replicate Link**: https://replicate.com/qwen/qwen2.5-7b-instruct

---

## Comparison Matrix

| Model | Speed | Context Window | Size | Cost | Quality |
|-------|-------|----------------|------|------|---------|
| Gemma-2B (current) | Slow | Limited | 2B | Low | Good |
| RecurrentGemma-2B | Fast | Limited | 2B | Low | Good |
| Mistral Small 3.1 | Very Fast | 128K | Small | Medium | Excellent |
| Llama 3.1 8B | Medium | 128K | 8B | Medium | Excellent |
| Qwen2.5 7B | Fast | 32K | 7B | Medium | Good |

## Recommendation

### Short-term (Immediate)
1. **Keep Gemma-2B** but implement HTML parsing (already done)
   - This should reduce processing time significantly
   - No model migration needed
   - Test performance with extracted content

### Medium-term (If still slow)
1. **Try RecurrentGemma-2B** first
   - Same model family, likely drop-in replacement
   - Better optimized for long sequences
   - Minimal code changes needed

2. **If RecurrentGemma-2B doesn't help, try Mistral Small 3.1**
   - Much faster inference
   - Huge context window (future-proof)
   - May require prompt adjustments

### Long-term
- Monitor model performance and costs
- Consider model rotation based on article length
- Implement model selection logic based on content size

## Migration Guide

### Switching to RecurrentGemma-2B

1. **Get Model Version**:
   ```bash
   # Visit https://replicate.com/google-deepmind/recurrent-gemma-2b
   # Copy the latest version ID
   ```

2. **Update Environment Variable**:
   ```bash
   supabase secrets set REPLICATE_MODEL_VERSION=<new-version-id>
   ```

3. **Test**:
   - Test with a few articles
   - Verify quality is acceptable
   - Monitor processing times

### Switching to Mistral Small 3.1

1. **Get Model Version**:
   ```bash
   # Visit https://replicate.com/mistralai/mistral-small-3.1
   # Copy the latest version ID
   ```

2. **Update Environment Variable**:
   ```bash
   supabase secrets set REPLICATE_MODEL_VERSION=<new-version-id>
   ```

3. **Update Prompt (if needed)**:
   - Mistral models may prefer different prompt formats
   - Test and adjust in `domain/replicate-client.ts`

4. **Test**:
   - Test with various article lengths
   - Verify quality and speed improvements
   - Monitor costs

## Testing Checklist

When evaluating a new model:

- [ ] Processing time for typical article (target: <30 seconds)
- [ ] Processing time for long article (target: <60 seconds)
- [ ] Summary quality (readability, accuracy)
- [ ] Cost per request
- [ ] Error rate
- [ ] Context window limits
- [ ] Cold start time (if applicable)

## Cost Considerations

- **Gemma-2B**: Very low cost, but slow
- **RecurrentGemma-2B**: Similar cost, faster
- **Mistral Small 3.1**: Higher cost, much faster
- **Larger models**: Higher cost, but may be worth it for quality

## Notes

- All model versions should be verified on Replicate before switching
- Model availability may change
- Always test in staging before production deployment
- Monitor costs when switching to larger/faster models

