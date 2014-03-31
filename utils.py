from django.utils.html import conditional_escape, escape
import re
#_nsre = re.compile(ur'(?iu)([0-9]+|(?:\b[mdclxvi]+\b))')
_nsre_romans = re.compile(ur'(?iu)(?:\.\s*)([ivxlcdm]+\b)')
_nsre = re.compile(ur'(?iu)([0-9]+)')

def sorted_natural(l, roman_numbers=False):
    '''Sorts l and returns it. Natural sorting is applied.'''
    return sorted(l, key=lambda e: natural_sort_key(e, roman_numbers))

def natural_sort_key(s, roman_numbers=False):
    '''
        Returns a list of tokens from a string.
        This list of tokens can be feed into a sorting function to come up with a natural sorting.
        Natural sorting is number-aware: e.g. 'word 2' < 'word 100'.
        
        If roman_numbers is True, roman numbers will be converted to ints.
        Note that there is no fool-proof was to detect roman numerals
        e.g. MS A; MS B; MS C. In this case C is a letter and not 500. 
            MS A.ix In this case ix is a number
        So as a heuristic we only consider roman number if preceded by '.'  
    '''
    
    if roman_numbers:
        while True:
            m = _nsre_romans.search(s)
            if m is None: break
            # convert the roman number into base 10 number
            number = get_int_from_roman_number(m.group(1))
            if number:
                # substition
                s = s[:m.start(1)] + str(number) + s[m.end(1):]
                
    return [int(text) if text.isdigit() else text.lower() for text in re.split(_nsre, s)]

def plural(value, count=2):
    '''
    Usage: 
            {{ var|plural }}
            {{ var|plural:count }}
            
            If [count] > 1 or [count] is not specified, the filter returns the plural form of [var].
            Plural form is generated by sequentially applying the following rules:
                * convert 'y' at the end into 'ie'               (contry -> contrie)
                * convert 'ss' at the end into 'e'               (witness -> witnesse)
                * add a 's' at the end is none already there     (nation -> nations)
    '''
    
    if count is not None:
        try:
            count = int(float(count))
        except ValueError:
            pass
        except TypeError:
            pass
        try:
            count = len(count)
        except TypeError:
            pass
    
    words = value.split(' ')
    if len(words) > 1:
        # We got a phrase. Pluralise each word separately.
        ret = ' '.join([plural(word, count) for word in words])
    else:
        ret = value
        if ret in ['of']: return ret
        if count != 1:
            if ret in ['a', 'an']: return ''
            if ret[-1:] == 'y': 
                ret = ret[:-1] + 'ie'
            if ret[-2:] == 'ss': 
                ret = ret + 'e'
            if not ret[-1:] == 's':
                ret = ret + 's'
    return ret

def update_query_string(url, updates, url_wins=False):
    '''
        Replace parameter values in the query string of the given URL.
        If url_wins is True, the query string values in [url] will always supersede the values from [updates].
        
        E.g.
        
        >> _update_query_string('http://www.mysite.com/about?category=staff&country=UK', 'who=bill&country=US')
        'http://www.mysite.com/about?category=staff&who=bill&country=US'

        >> _update_query_string('http://www.mysite.com/about?category=staff&country=UK', {'who': ['bill'], 'country': ['US']})
        'http://www.mysite.com/about?category=staff&who=bill&country=US'
        
    '''
    show = url == '?page=2&amp;terms=%C3%86thelstan&amp;repository=&amp;ordering=&amp;years=&amp;place=&amp;basic_search_type=hands&amp;date=&amp;scribes=&amp;result_type=' and updates == 'result_type=manuscripts'
    
    ret = url.strip()
    if ret and ret[0] == '#': return ret

    from urlparse import urlparse, urlunparse, parse_qs
    
    # Convert string format into a dictionary
    if isinstance(updates, basestring):
        updates_dict = parse_qs(updates, True)
    else:
        from copy import deepcopy
        updates_dict = deepcopy(updates)
    
    # Merge the two query strings (url and updates)
    # note that urlparse preserves the url encoding (%, &amp;)
    parts = [p for p in urlparse(url)]
    # note that parse_qs converts u'terms=%C3%86thelstan' into u'\xc3\x86thelstan'
    # See http://stackoverflow.com/questions/16614695/python-urlparse-parse-qs-unicode-url
    # for the reaon behind the call to encode('ASCII') 
    query_dict = parse_qs(parts[4].encode('ASCII'))
    if url_wins:
        updates_dict.update(query_dict)
        query_dict = updates_dict
    else:
        query_dict.update(updates_dict)
    
    # Now query_dict is our updated query string as a dictionary 
    # Parse and unparse it again to remove the empty values
    query_dict = parse_qs(urlencode(query_dict, True))
    
    # Convert back into a string    
    parts[4] = urlencode(query_dict, True)
    
    # Place the query string back into the URL
    ret = urlunparse(parts)
    
    ret = escape(ret)
    
    return ret

def urlencode(dict, doseq=0):
    ''' This is a unicode-compatible wrapper around urllib.urlencode()
        See http://stackoverflow.com/questions/3121186/error-with-urlencode-in-python
    '''
    import urllib
    d = {}
    for k,v in dict.iteritems():
        d[k] = []
        for v2 in dict[k]:
            if isinstance(v2, unicode):
                v2 = v2.encode('utf=8')
            d[k].append(v2)
    ret = urllib.urlencode(d, doseq)
    return ret

def get_json_response(data):
    '''Returns a HttpResponse with the given data variable encoded as json'''
    import json
    from django.http import HttpResponse 
    return HttpResponse(json.dumps(data), mimetype="application/json")

def get_tokens_from_phrase(phrase, lowercase=False):
    ''' Returns a list of tokens from a query phrase.
    
        Discard stop words (NOT, OR, AND)
        Detect quoted pieces ("two glosses")
    
        e.g. "ab cd" ef-yo NOT (gh)
        => ['ab cd', 'ef', 'yo', 'gh']
    '''
    ret = []
    
    if lowercase:
        phrase = phrase.lower()
    
    phrase = phrase.strip()
    
    # extract the quoted pieces
    for part in re.findall(ur'"([^"]+)"', phrase):
        ret.append(part)
        
    phrase = re.sub(ur'"[^"]+"', '', phrase)
    
    # JIRA 358: search for 8558-8563 => no highlight if we don't remove non-characters before tokenising
    phrase = re.sub(ur'\W', ' ', phrase)
    
    # add the remaining tokens
    if phrase:
        ret.extend([t for t in re.split(ur'\s+', phrase.lower().strip()) if t.lower() not in ['and', 'or', 'not']])
    
    return ret

def get_regexp_from_terms(terms):
    ret = ''
    if terms:
        # create a regexp
        ret = []
        for t in terms:
            t = re.escape(t)
            if len(t) > 1:
                t += ur'?'
            t = ur'\b%ss?\b' % t
            ret.append(t)
        ret = ur'|'.join(ret)
        
        # convert all \* into \W*
        #ret = ret.replace(ur'\*', ur'\w*')
    
    return ret

def find_first(pattern, text, default=''):
    ret = default
    matches = re.findall(pattern, text)
    if matches: ret = matches[0]
    return ret

def get_int_from_roman_number(input):
    """
    From 
    http://code.activestate.com/recipes/81611-roman-numerals/
    
    Convert a roman numeral to an integer.
    
    >>> r = range(1, 4000)
    >>> nums = [int_to_roman(i) for i in r]
    >>> ints = [roman_to_int(n) for n in nums]
    >>> print r == ints
    1
    
    >>> roman_to_int('VVVIV')
    Traceback (most recent call last):
    ...
    ValueError: input is not a valid roman numeral: VVVIV
    >>> roman_to_int(1)
    Traceback (most recent call last):
    ...
    TypeError: expected string, got <type 'int'>
    >>> roman_to_int('a')
    Traceback (most recent call last):
    ...
    ValueError: input is not a valid roman numeral: A
    >>> roman_to_int('IL')
    Traceback (most recent call last):
    ...
    ValueError: input is not a valid roman numeral: IL
    """
    if not isinstance(input, basestring):
        return None
    input = input.upper()
    nums = ['M', 'D', 'C', 'L', 'X', 'V', 'I']
    ints = [1000, 500, 100, 50,  10,  5,   1]
    places = []
    for c in input:
        if not c in nums:
            #raise ValueError, "input is not a valid roman numeral: %s" % input
            return None
    for i in range(len(input)):
        c = input[i]
        value = ints[nums.index(c)]
        # If the next place holds a larger number, this value is negative.
        try:
            nextvalue = ints[nums.index(input[i +1])]
            if nextvalue > value:
                value *= -1
        except IndexError:
            # there is no next place.
            pass
        places.append(value)
    sum = 0
    for n in places: sum += n
    return sum

def get_plain_text_from_html(html):
    '''Returns the unencoded text from a HTML fragment. No tags, no entities, just plain utf-8 text.'''
    ret = html
    if ret:
        from django.utils.html import strip_tags
        import HTMLParser
        html_parser = HTMLParser.HTMLParser()
        ret = strip_tags(html_parser.unescape(ret))        
    else:
        ret = u''
    return ret
