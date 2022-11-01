/* @flow */

import { isRegExp, remove } from 'shared/util'
import { getFirstComponentChild } from 'core/vdom/helpers/index'

type VNodeCache = { [key: string]: ?VNode }

function getComponentName(opts: ?VNodeComponentOptions): ?string {
  return opts && (opts.Ctor.options.name || opts.tag)
}

function matches(pattern: string | RegExp | Array<string>, name: string): boolean {
  if (Array.isArray(pattern)) {
    return pattern.indexOf(name) > -1
  } else if (typeof pattern === 'string') {
    return pattern.split(',').indexOf(name) > -1
  } else if (isRegExp(pattern)) {
    return pattern.test(name)
  }
  /* istanbul ignore next */
  return false
}

function pruneCache(keepAliveInstance: any, filter: Function) {
  const { cache, keys, _vnode } = keepAliveInstance
  for (const key in cache) {
    const cachedNode: ?VNode = cache[key]
    if (cachedNode) {
      const name: ?string = getComponentName(cachedNode.componentOptions)
      if (name && !filter(name)) {
        pruneCacheEntry(cache, key, keys, _vnode)
      }
    }
  }
}

function pruneCacheEntry(cache: VNodeCache, key: string, keys: Array<string>, current?: VNode) {
  const cached = cache[key]
  // * 判断当前没有处于被渲染状态的组件，将其销毁
  if (cached && (!current || cached.tag !== current.tag)) {
    cached.componentInstance.$destroy()
  }
  cache[key] = null
  remove(keys, key)
}

const patternTypes: Array<Function> = [String, RegExp, Array]

export default {
  name: 'keep-alive',
  abstract: true,

  props: {
    include: patternTypes,
    exclude: patternTypes,
    max: [String, Number]
  },

  // * 在props选项内接收传进来的三个属性：include、exclude和max
  // * include 表示只有匹配到的组件会被缓存，
  // * 而 exclude 表示任何匹配到的组件都不会被缓存，
  // * max表示缓存组件的数量，因为我们是缓存的 vnode 对象，它也会持有 DOM，
  // * 当我们缓存的组件很多的时候，会比较占用内存，所以该配置允许我们指定缓存组件的数量。

  created() {
    this.cache = Object.create(null)
    this.keys = []
  },

  // * 当<keep-alive>组件被销毁时，此时会调用destroyed钩子函数，
  // * 在该钩子函数里会遍历this.cache对象，然后将那些被缓存的并且当前没有处于被渲染状态的组件都销毁掉，
  // * 并将其从this.cache对象中剔除。如下：
  destroyed() {
    for (const key in this.cache) {
      pruneCacheEntry(this.cache, key, this.keys)
    }
  },

  mounted() {
    this.$watch('include', (val) => {
      pruneCache(this, (name) => matches(val, name))
    })
    this.$watch('exclude', (val) => {
      pruneCache(this, (name) => !matches(val, name))
    })
  },

  render() {
    // * 获取默认插槽中的第一个组件节点
    const slot = this.$slots.default
    const vnode: VNode = getFirstComponentChild(slot)

    // * 获取该组件节点的 componentOptions
    const componentOptions: ?VNodeComponentOptions = vnode && vnode.componentOptions

    if (componentOptions) {
      // check pattern
      const name: ?string = getComponentName(componentOptions) // * 获取该组件节点的名称，优先获取组件的 name 字段，如果 name 不存在则获取组件的 tag
      const { include, exclude } = this
      if (
        // * not included 不在设定的缓存范围内
        (include && (!name || !matches(include, name))) ||
        // * excluded 在设定的不缓存范围内
        (exclude && name && matches(exclude, name))
      ) {
        return vnode // * 直接返回 vnode 不缓存
      }

      const { cache, keys } = this
      const key: ?string =
        vnode.key == null
          ? // same constructor may get registered as different local components
            // so cid alone is not enough (#3269)
            componentOptions.Ctor.cid + (componentOptions.tag ? `::${componentOptions.tag}` : '')
          : vnode.key
      if (cache[key]) {
        vnode.componentInstance = cache[key].componentInstance
        // make current key freshest
        // * 调整该组件key的顺序，将其从原来的地方删掉并重新放在最后一个
        // ? max表示最多可以缓存多少组件实例。一旦这个数字达到了，在新实例被创建之前，已缓存组件中最久没有被访问的实例会被销毁掉。
        remove(keys, key)
        keys.push(key)
      } else {
        cache[key] = vnode
        keys.push(key)
        // prune oldest entry
        // * 如果配置了max并且缓存的长度超过了this.max，则从缓存中删除第一个
        if (this.max && keys.length > parseInt(this.max)) {
          pruneCacheEntry(cache, keys[0], keys, this._vnode)
        }
      }
      // * 最后设置keepAlive标记位
      vnode.data.keepAlive = true
    }
    return vnode || (slot && slot[0])
  }
}
